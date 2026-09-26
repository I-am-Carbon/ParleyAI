"""Interview planning and the adaptive question/answer loop.

The LLM scores each answer and proposes what to do next; the rules here decide
which moves are allowed (follow-up caps, turn/time limits) so the interview
always progresses and ends.
"""

import json
from typing import Any

from sqlmodel import Session, select

from app import config
from app.models import Candidate, Interview, Job, Turn, utcnow
from app.schemas import AnswerIn, InterviewPlan, QuestionOut, TurnEval
from app.services import llm

CLOSING_MESSAGE = (
    "Thank you, that's all the questions I have. The interview is now complete, "
    "and you'll hear back about next steps soon."
)
HISTORY_TURNS = 6


class InterviewStateError(RuntimeError):
    pass


def format_competencies(competencies: list[dict[str, Any]]) -> str:
    if not competencies:
        return "(none provided)"
    return "\n".join(f"- {c['name']}: {c.get('description', '')}".rstrip(": ") for c in competencies)


# ---------- planning ----------


def build_plan(job: Job, profile: dict[str, Any]) -> list[dict[str, Any]]:
    system = llm.render(
        "plan",
        job_title=job.title,
        job_description=job.description,
        competencies=format_competencies(job.competencies),
        profile=json.dumps(profile, indent=2),
        num_topics=config.NUM_TOPICS,
    )
    plan = llm.complete_json(system, "Create the interview plan now.", InterviewPlan, temperature=0.5)
    return [t.model_dump() for t in plan.topics[: config.NUM_TOPICS]]


# ---------- helpers ----------


def get_turns(session: Session, interview_id: int) -> list[Turn]:
    return list(session.exec(select(Turn).where(Turn.interview_id == interview_id).order_by(Turn.idx)).all())


def _current_turn(session: Session, interview: Interview) -> Turn:
    turns = get_turns(session, interview.id)
    if not turns:
        raise InterviewStateError("Interview has not started.")
    return turns[-1]


def _to_out(turn: Turn, done: bool) -> QuestionOut:
    return QuestionOut(turn_idx=turn.idx, topic=turn.topic, question=turn.question, done=done)


def _add_turn(session: Session, interview: Interview, topic: str, question: str) -> Turn:
    state = dict(interview.state)
    turn = Turn(interview_id=interview.id, idx=state.get("turn_count", 0), topic=topic, question=question)
    state["turn_count"] = turn.idx + 1
    interview.state = state  # reassign so SQLAlchemy notices the JSON change
    session.add(turn)
    return turn


def _format_history(turns: list[Turn]) -> str:
    lines = []
    for t in turns[-HISTORY_TURNS:]:
        lines.append(f"Interviewer: {t.question}")
        if t.answer_transcript is not None:
            lines.append(f"Candidate: {t.answer_transcript}")
    return "\n".join(lines) or "(start of interview)"


def _elapsed_minutes(interview: Interview) -> float:
    if not interview.started_at:
        return 0.0
    return (utcnow() - interview.started_at).total_seconds() / 60


def _allowed_decisions(interview: Interview) -> list[str]:
    state = interview.state
    is_last_topic = state["topic_idx"] >= len(interview.plan) - 1
    out_of_budget = (
        state["turn_count"] >= config.MAX_TURNS - 1 or _elapsed_minutes(interview) >= config.MAX_MINUTES
    )
    if out_of_budget:
        return ["wrap_up"]
    allowed = []
    if state["followups_used"] < config.MAX_FOLLOWUPS_PER_TOPIC:
        allowed.append("probe_deeper")
        if not state["simplified"]:
            allowed.append("simplify")
    allowed.append("wrap_up" if is_last_topic else "next_topic")
    return allowed


# ---------- public API ----------


def start_interview(session: Session, interview: Interview, candidate: Candidate, job: Job) -> QuestionOut:
    if interview.status == "completed":
        raise InterviewStateError("Interview is already completed.")
    if interview.status == "in_progress":
        # Idempotent (e.g. page refresh): return the current question.
        return _to_out(_current_turn(session, interview), done=False)

    first = interview.plan[0]
    first_name = (candidate.name.split() or ["there"])[0]
    greeting = (
        f"Hi {first_name}, I'm {config.INTERVIEWER_NAME}, and I'll be interviewing you today for the "
        f"{job.title} role. We'll cover a few topics, and feel free to take a moment to think before "
        f"you answer. Let's begin. {first['opening_question']}"
    )
    interview.state = {"topic_idx": 0, "followups_used": 0, "simplified": False, "turn_count": 0}
    interview.status = "in_progress"
    interview.started_at = utcnow()
    turn = _add_turn(session, interview, first["title"], greeting)
    session.add(interview)
    session.commit()
    session.refresh(turn)
    return _to_out(turn, done=False)


def submit_answer(session: Session, interview: Interview, job: Job, answer: AnswerIn) -> QuestionOut:
    if interview.status != "in_progress":
        raise InterviewStateError(f"Interview is {interview.status}, not in progress.")

    turns = get_turns(session, interview.id)
    current = turns[-1]
    if current.answer_transcript is not None:
        raise InterviewStateError("The current question was already answered.")

    transcript = answer.transcript.strip()
    if not transcript:
        # Nothing heard: ask again without advancing.
        return QuestionOut(
            turn_idx=current.idx,
            topic=current.topic,
            question="Sorry, I didn't catch that. Could you please answer again?",
            done=False,
        )

    current.answer_transcript = transcript
    current.answer_duration_s = answer.duration_s

    state = dict(interview.state)
    plan = interview.plan
    topic = plan[state["topic_idx"]]
    next_topic = plan[state["topic_idx"] + 1] if state["topic_idx"] + 1 < len(plan) else None
    allowed = _allowed_decisions(interview)

    system = llm.render(
        "turn",
        interviewer_name=config.INTERVIEWER_NAME,
        job_title=job.title,
        topic_num=state["topic_idx"] + 1,
        topic_total=len(plan),
        topic_title=topic["title"],
        competency=topic["competency"],
        resume_evidence=topic["resume_evidence"],
        followups_used=state["followups_used"],
        max_followups=config.MAX_FOLLOWUPS_PER_TOPIC,
        next_topic=(
            f"{next_topic['title']} ({next_topic['competency']}). Suggested question: {next_topic['opening_question']}"
            if next_topic
            else "(none, this is the last topic)"
        ),
        history=_format_history(turns),
        answer=transcript,
        allowed_decisions=", ".join(allowed),
    )
    result = llm.complete_json(system, "Evaluate the answer and decide what to say next.", TurnEval, temperature=0.6)

    decision = result.decision
    next_question = result.next_question.strip()
    if decision not in allowed:
        # The model picked a move the rules don't allow; fall back to a safe transition.
        decision = "next_topic" if "next_topic" in allowed else "wrap_up"
        next_question = (
            f"Thanks. Let's move on. {next_topic['opening_question']}"
            if decision == "next_topic"
            else CLOSING_MESSAGE
        )

    current.eval = {**result.model_dump(exclude={"next_question"}), "decision": decision}
    session.add(current)

    if decision == "wrap_up":
        turn = _add_turn(session, interview, "Closing", next_question or CLOSING_MESSAGE)
        interview.status = "completed"
        interview.ended_at = utcnow()
        done = True
    else:
        state = dict(interview.state)
        if decision == "next_topic":
            state.update(topic_idx=state["topic_idx"] + 1, followups_used=0, simplified=False)
            topic = plan[state["topic_idx"]]
        else:
            state["followups_used"] += 1
            if decision == "simplify":
                state["simplified"] = True
        interview.state = state
        turn = _add_turn(session, interview, topic["title"], next_question)
        done = False

    session.add(interview)
    session.commit()
    session.refresh(turn)
    return _to_out(turn, done=done)


def end_interview(session: Session, interview: Interview) -> None:
    """End early (candidate or recruiter clicked 'finish')."""
    if interview.status == "completed":
        return
    if interview.status == "created":
        raise InterviewStateError("Interview has not started.")
    interview.status = "completed"
    interview.ended_at = utcnow()
    session.add(interview)
    session.commit()
