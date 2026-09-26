from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Job(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str
    # [{name, weight, description}]
    competencies: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class Candidate(SQLModel, table=True):
    """A user account. Despite the name, recruiters are stored here too (role="recruiter")."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: Optional[str] = Field(default=None, index=True)
    password_hash: Optional[str] = None
    role: str = "candidate"  # candidate | recruiter
    resume_text: str
    resume_profile: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class Interview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    candidate_id: int = Field(foreign_key="candidate.id", index=True)
    mode: str = "recruiter"  # recruiter | practice
    status: str = "created"  # created | in_progress | completed
    # [{competency, title, resume_evidence, opening_question}]
    plan: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    # {topic_idx, followups_used, simplified, turn_count}
    state: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    baseline_pose: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    # Recruiter-mode results stay with the hiring team until a recruiter shares them with the candidate.
    results_shared: bool = False
    # Set when attention monitoring ended the interview automatically: looking_away | multiple_faces | no_face
    end_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class Turn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    interview_id: int = Field(foreign_key="interview.id", index=True)
    idx: int
    topic: str
    question: str
    answer_transcript: Optional[str] = None
    answer_duration_s: Optional[float] = None
    # {answer_score, signals, decision, rationale}
    eval: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class IntegrityEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    interview_id: int = Field(foreign_key="interview.id", index=True)
    type: str  # looking_away | no_face | multiple_faces | tab_hidden
    started_at_ms: int  # ms since interview start
    duration_ms: int
    meta: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    interview_id: int = Field(foreign_key="interview.id", unique=True)
    overall_score: int  # 0-100
    recommendation: str  # strong_yes | yes | maybe | no
    competency_scores: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    strengths: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    gaps: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    summary: str
    integrity_summary: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class CandidateSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_id: int = Field(foreign_key="candidate.id", index=True)
    email: str = Field(index=True)
    token: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    last_accessed_at: datetime = Field(default_factory=utcnow)
