from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from app.db import get_session
from app.deps import can_view, current_user, require_candidate, require_recruiter, results_hidden
from app.models import Candidate, IntegrityEvent, Interview, Job, Report
from app.schemas import AnswerIn, FinishIn, IntegrityBatch, QuestionOut, ShareIn
from app.services import interview_engine, report as report_service
from app.services.resume_parser import extract_text, parse_profile

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


def _load(session: Session, interview_id: int, user: Candidate) -> tuple[Interview, Job, Candidate]:
    """Load an interview the user may view. 404 (not 403) so other people's interview IDs aren't revealed."""
    interview = session.get(Interview, interview_id)
    if not interview or not can_view(user, interview):
        raise HTTPException(404, "Interview not found")
    return interview, session.get(Job, interview.job_id), session.get(Candidate, interview.candidate_id)


def _load_own(session: Session, interview_id: int, user: Candidate) -> tuple[Interview, Job, Candidate]:
    """Load an interview the user is taking (only its candidate can act on it)."""
    interview = session.get(Interview, interview_id)
    if not interview or interview.candidate_id != user.id:
        raise HTTPException(404, "Interview not found")
    return interview, session.get(Job, interview.job_id), session.get(Candidate, interview.candidate_id)


def _summary(session: Session, interview: Interview, job: Job, candidate: Candidate, user: Candidate) -> dict[str, Any]:
    report = session.exec(select(Report).where(Report.interview_id == interview.id)).first()
    hidden = results_hidden(user, interview)
    show = report is not None and not hidden
    return {
        "id": interview.id,
        "candidate_name": candidate.name,
        "candidate_email": candidate.email if user.role == "recruiter" else None,
        "job_id": job.id,
        "job_title": job.title,
        "mode": interview.mode,
        "status": interview.status,
        "created_at": interview.created_at,
        "started_at": interview.started_at,
        "ended_at": interview.ended_at,
        "has_report": report is not None,
        "results_visible": not hidden,
        "results_shared": interview.results_shared,
        "end_reason": interview.end_reason,
        "overall_score": report.overall_score if show else None,
        "recommendation": report.recommendation if show else None,
        "integrity_risk": report.integrity_summary.get("risk_level") if show and user.role == "recruiter" else None,
    }


@router.post("")
def create_interview(
    resume: UploadFile = File(...),
    job_id: int = Form(...),
    mode: Literal["recruiter", "practice"] = Form("recruiter"),
    session: Session = Depends(get_session),
    user: Candidate = Depends(require_candidate),
):
    """Create a new interview for the signed-in candidate."""
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    resume_text = extract_text(resume.filename, resume.file.read())
    profile = parse_profile(resume_text).model_dump()
    plan = interview_engine.build_plan(job, profile)

    user.resume_text = resume_text
    user.resume_profile = profile
    session.add(user)

    interview = Interview(job_id=job.id, candidate_id=user.id, mode=mode, plan=plan)
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return {**_summary(session, interview, job, user, user), "plan": plan, "profile": profile}


@router.get("")
def list_interviews(session: Session = Depends(get_session), user: Candidate = Depends(current_user)):
    """Recruiters see every interview; candidates see their own."""
    query = select(Interview).order_by(Interview.id.desc())
    if user.role != "recruiter":
        query = query.where(Interview.candidate_id == user.id)
    return [
        _summary(session, i, session.get(Job, i.job_id), session.get(Candidate, i.candidate_id), user)
        for i in session.exec(query).all()
    ]


@router.get("/{interview_id}")
def get_interview(interview_id: int, session: Session = Depends(get_session), user: Candidate = Depends(current_user)):
    interview, job, candidate = _load(session, interview_id, user)
    hidden = results_hidden(user, interview)
    turns = []
    for t in interview_engine.get_turns(session, interview.id):
        turn = t.model_dump()
        if hidden:
            turn["eval"] = None  # per-answer scores are for the hiring team
        turns.append(turn)
    return {
        **_summary(session, interview, job, candidate, user),
        "plan": interview.plan,
        "state": interview.state,
        "profile": candidate.resume_profile,
        "turns": turns,
    }


@router.post("/{interview_id}/start", response_model=QuestionOut)
def start_interview(interview_id: int, session: Session = Depends(get_session), user: Candidate = Depends(current_user)):
    interview, job, candidate = _load_own(session, interview_id, user)
    return interview_engine.start_interview(session, interview, candidate, job)


@router.post("/{interview_id}/answer", response_model=QuestionOut)
def answer(
    interview_id: int, body: AnswerIn, session: Session = Depends(get_session), user: Candidate = Depends(current_user)
):
    interview, job, _ = _load_own(session, interview_id, user)
    return interview_engine.submit_answer(session, interview, job, body)


@router.post("/{interview_id}/integrity")
def add_integrity_events(
    interview_id: int, body: IntegrityBatch, session: Session = Depends(get_session), user: Candidate = Depends(current_user)
):
    interview, _, _ = _load_own(session, interview_id, user)
    if interview.mode == "practice":
        return {"accepted": 0}
    if interview.status == "created":
        raise HTTPException(409, "Interview has not started.")
    if body.baseline_pose is not None:
        interview.baseline_pose = body.baseline_pose
        session.add(interview)
    for e in body.events:
        session.add(IntegrityEvent(interview_id=interview.id, **e.model_dump()))
    session.commit()
    return {"accepted": len(body.events)}


@router.post("/{interview_id}/share")
def share_results(
    interview_id: int,
    body: ShareIn,
    session: Session = Depends(get_session),
    user: Candidate = Depends(require_recruiter),
):
    """Recruiter releases (or withdraws) a recruiter-mode interview's results to the candidate."""
    interview, _, _ = _load(session, interview_id, user)
    if interview.mode != "recruiter":
        raise HTTPException(400, "Practice feedback is always visible to the candidate.")
    if not session.exec(select(Report).where(Report.interview_id == interview.id)).first():
        raise HTTPException(409, "There are no results to share until the interview is finished.")
    interview.results_shared = body.shared
    session.add(interview)
    session.commit()
    return {"interview_id": interview.id, "results_shared": interview.results_shared}


@router.post("/{interview_id}/finish")
def finish_interview(
    interview_id: int,
    body: Optional[FinishIn] = None,
    session: Session = Depends(get_session),
    user: Candidate = Depends(current_user),
):
    interview, job, candidate = _load_own(session, interview_id, user)
    if body and body.reason and interview.mode == "recruiter" and interview.status == "in_progress":
        interview.end_reason = body.reason
        session.add(interview)
    interview_engine.end_interview(session, interview)
    report = report_service.generate_report(session, interview, job, candidate)
    hidden = results_hidden(user, interview)
    return {
        "interview_id": interview.id,
        "status": interview.status,
        "results_visible": not hidden,
        "overall_score": None if hidden else report.overall_score,
    }
