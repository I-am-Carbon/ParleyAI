"""Request dependencies for authentication and access rules."""

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Candidate, Interview
from app.services import auth


def bearer_token(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in.")
    return authorization[len("Bearer ") :]


def current_user(token: str = Depends(bearer_token), session: Session = Depends(get_session)) -> Candidate:
    try:
        return auth.validate_token(session, token)
    except auth.AuthError as e:
        raise HTTPException(401, str(e))


def require_candidate(user: Candidate = Depends(current_user)) -> Candidate:
    if user.role != "candidate":
        raise HTTPException(403, "Only candidate accounts can take interviews.")
    return user


def require_recruiter(user: Candidate = Depends(current_user)) -> Candidate:
    if user.role != "recruiter":
        raise HTTPException(403, "Recruiter access required.")
    return user


def can_view(user: Candidate, interview: Interview) -> bool:
    return user.role == "recruiter" or interview.candidate_id == user.id


def results_hidden(user: Candidate, interview: Interview) -> bool:
    """Candidates don't see the evaluation of real (recruiter-mode) interviews until a recruiter shares it."""
    return user.role != "recruiter" and interview.mode == "recruiter" and not interview.results_shared


def integrity_hidden(user: Candidate, interview: Interview) -> bool:
    """Integrity observations are for the hiring team only, even after results are shared."""
    return user.role != "recruiter"
