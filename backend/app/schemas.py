from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------- LLM structured outputs ----------


class Experience(BaseModel):
    role: str = ""
    company: str = ""
    duration: str = ""
    highlights: list[str] = []


class Project(BaseModel):
    name: str = ""
    description: str = ""
    tech: list[str] = []


class ResumeProfile(BaseModel):
    name: str = ""
    headline: str = ""
    years_experience: Optional[float] = None
    skills: list[str] = []
    experience: list[Experience] = []
    projects: list[Project] = []
    education: list[str] = []


class Topic(BaseModel):
    competency: str
    title: str
    resume_evidence: str
    opening_question: str


class InterviewPlan(BaseModel):
    topics: list[Topic] = Field(min_length=1)


Decision = Literal["probe_deeper", "simplify", "next_topic", "wrap_up"]


class TurnEval(BaseModel):
    answer_score: int = Field(ge=1, le=5)
    signals: list[str] = []
    decision: Decision
    next_question: str
    rationale: str = ""


class CompetencyScore(BaseModel):
    competency: str
    score: int = Field(ge=1, le=5)
    evidence: list[str] = []
    comment: str = ""


class EvaluationReport(BaseModel):
    competency_scores: list[CompetencyScore] = Field(min_length=1)
    strengths: list[str]
    gaps: list[str]
    summary: str


# ---------- API I/O ----------


class Competency(BaseModel):
    name: str
    weight: float = 1.0
    description: str = ""


class JobCreate(BaseModel):
    title: str
    description: str
    competencies: list[Competency] = []


class AnswerIn(BaseModel):
    transcript: str
    duration_s: Optional[float] = None


class ShareIn(BaseModel):
    shared: bool = True


EndReason = Literal["looking_away", "multiple_faces", "no_face"]


class FinishIn(BaseModel):
    # Present when attention monitoring ended the interview automatically.
    reason: Optional[EndReason] = None


class QuestionOut(BaseModel):
    turn_idx: int
    topic: str
    question: str
    done: bool


EventType = Literal["looking_away", "no_face", "multiple_faces", "tab_hidden", "camera_off"]


class IntegrityEventIn(BaseModel):
    type: EventType
    started_at_ms: int = Field(ge=0)
    duration_ms: int = Field(ge=0)
    meta: dict[str, Any] = {}


class IntegrityBatch(BaseModel):
    events: list[IntegrityEventIn] = []
    baseline_pose: Optional[dict[str, float]] = None


# ---------- Auth ----------


Role = Literal["candidate", "recruiter"]


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=200)
    role: Role = "candidate"
    recruiter_code: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: Role


class SessionResponse(UserOut):
    token: str
