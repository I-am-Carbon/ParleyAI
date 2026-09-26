from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.deps import can_view, current_user, integrity_hidden, results_hidden
from app.models import Candidate, IntegrityEvent, Interview, Job, Report
from app.services.interview_engine import get_turns

router = APIRouter(prefix="/api/interviews", tags=["reports"])


@router.get("/{interview_id}/report")
def get_report(interview_id: int, session: Session = Depends(get_session), user: Candidate = Depends(current_user)):
    interview = session.get(Interview, interview_id)
    if not interview or not can_view(user, interview):
        raise HTTPException(404, "Interview not found")
    if results_hidden(user, interview):
        raise HTTPException(403, "Your results haven't been shared yet. The hiring team is still reviewing this interview.")
    report = session.exec(select(Report).where(Report.interview_id == interview_id)).first()
    if not report:
        raise HTTPException(404, "Report not generated yet. Call POST /finish first.")

    job = session.get(Job, interview.job_id)
    candidate = session.get(Candidate, interview.candidate_id)
    report_data = report.model_dump()
    events = []
    if integrity_hidden(user, interview):
        report_data["integrity_summary"] = {"enabled": False, "note": "Integrity observations are visible to the hiring team only."}
    else:
        events = session.exec(
            select(IntegrityEvent).where(IntegrityEvent.interview_id == interview_id).order_by(IntegrityEvent.started_at_ms)
        ).all()
    return {
        "interview_id": interview.id,
        "mode": interview.mode,
        "experience_level": interview.experience_level,
        "results_shared": interview.results_shared,
        "end_reason": interview.end_reason,
        "candidate": {"name": candidate.name, "email": candidate.email, "profile": candidate.resume_profile},
        "job": {"id": job.id, "title": job.title},
        "started_at": interview.started_at,
        "ended_at": interview.ended_at,
        "report": report_data,
        "transcript": [t.model_dump() for t in get_turns(session, interview_id)],
        "integrity_events": [e.model_dump() for e in events],
    }
