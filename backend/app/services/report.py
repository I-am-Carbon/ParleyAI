"""Final evaluation report.

The LLM scores each competency with quoted evidence. The overall score and
recommendation are computed deterministically from those scores so the same
competency scores always produce the same outcome.
"""

import json
from typing import Any

from sqlmodel import Session, select

from app import config
from app.levels import level_info
from app.models import Candidate, IntegrityEvent, Interview, Job, Report
from app.schemas import EvaluationReport
from app.services import integrity, llm
from app.services.interview_engine import format_competencies, get_turns

RECRUITER_AUDIENCE = "3-5 sentences for a recruiter summarising overall suitability for the role."
PRACTICE_AUDIENCE = (
    "3-5 sentences of constructive coaching addressed directly to the candidate as 'you', "
    "including concrete tips to improve. Also phrase the gaps as actionable advice."
)


class ReportError(RuntimeError):
    pass


def _competencies(job: Job, interview: Interview) -> list[dict[str, Any]]:
    if job.competencies:
        return job.competencies
    seen: dict[str, dict[str, Any]] = {}
    for topic in interview.plan:
        seen.setdefault(topic["competency"].lower(), {"name": topic["competency"], "weight": 1.0})
    return list(seen.values())


def _overall(scores: list[dict[str, Any]], competencies: list[dict[str, Any]]) -> tuple[int, str]:
    weights = {c["name"].lower(): float(c.get("weight", 1.0)) for c in competencies}
    total = weight_sum = 0.0
    for s in scores:
        w = weights.get(s["competency"].lower(), 1.0)
        total += w * s["score"]
        weight_sum += w
    avg = total / weight_sum if weight_sum else 1.0
    overall = round((avg - 1) / 4 * 100)
    if overall >= 80:
        rec = "strong_yes"
    elif overall >= 65:
        rec = "yes"
    elif overall >= 45:
        rec = "maybe"
    else:
        rec = "no"
    return overall, rec


def _transcript(session: Session, interview: Interview) -> str:
    parts = []
    for t in get_turns(session, interview.id):
        if t.answer_transcript is None:
            continue
        note = ""
        if t.eval:
            note = f"\n(Interviewer note: {t.eval.get('answer_score')}/5; {'; '.join(t.eval.get('signals', []))})"
        parts.append(f"[Topic: {t.topic}]\nInterviewer: {t.question}\nCandidate: {t.answer_transcript}{note}")
    return "\n\n".join(parts)


def generate_report(session: Session, interview: Interview, job: Job, candidate: Candidate) -> Report:
    existing = session.exec(select(Report).where(Report.interview_id == interview.id)).first()
    if existing:
        return existing

    transcript = _transcript(session, interview)
    competencies = _competencies(job, interview)
    if transcript:
        lvl = level_info(interview.experience_level)
        system = llm.render(
            "report",
            job_title=job.title,
            level_label=lvl["label"],
            level_scoring=lvl["scoring"],
            job_description=job.description,
            competencies=format_competencies(competencies),
            profile=json.dumps(candidate.resume_profile, indent=2),
            transcript=transcript,
            audience=PRACTICE_AUDIENCE if interview.mode == "practice" else RECRUITER_AUDIENCE,
        )
        result = llm.complete_json(
            system, "Write the evaluation now.", EvaluationReport, model=config.LLM_MODEL_REPORT, temperature=0.2
        )
        scores = [s.model_dump() for s in result.competency_scores]
        overall, recommendation = _overall(scores, competencies)
        strengths, gaps, summary = result.strengths, result.gaps, result.summary
    elif interview.end_reason:
        # Ended automatically before any answer: keep a record for the recruiter, with nothing to score.
        scores = [
            {"competency": c["name"], "score": 1, "evidence": [], "comment": "Not assessed: the interview ended before this was covered."}
            for c in competencies
        ]
        overall, recommendation = 0, "no"
        strengths, gaps = [], ["No questions were answered before the interview ended."]
        summary = "The interview was ended automatically by attention monitoring before any questions were answered."
    else:
        raise ReportError("The candidate has not answered any questions, so there is nothing to evaluate.")

    events = list(session.exec(select(IntegrityEvent).where(IntegrityEvent.interview_id == interview.id)).all())
    session_seconds = (
        (interview.ended_at - interview.started_at).total_seconds()
        if interview.started_at and interview.ended_at
        else 0.0
    )

    report = Report(
        interview_id=interview.id,
        overall_score=overall,
        recommendation=recommendation,
        competency_scores=scores,
        strengths=strengths,
        gaps=gaps,
        summary=summary,
        integrity_summary=integrity.summarize(
            events, session_seconds, enabled=interview.mode == "recruiter", end_reason=interview.end_reason
        ),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report
