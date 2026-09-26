from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.deps import bearer_token, current_user
from app.models import Candidate, CandidateSession
from app.schemas import LoginRequest, SessionResponse, SignupRequest, UserOut
from app.services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session_response(user: Candidate, sess: CandidateSession) -> SessionResponse:
    return SessionResponse(token=sess.token, id=user.id, email=user.email or "", name=user.name, role=user.role)


@router.post("/signup", response_model=SessionResponse)
def signup(body: SignupRequest, session: Session = Depends(get_session)):
    try:
        return _session_response(*auth.signup(session, body))
    except auth.AuthError as e:
        raise HTTPException(400, str(e))


@router.post("/login", response_model=SessionResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    try:
        return _session_response(*auth.login(session, body.email, body.password))
    except auth.AuthError as e:
        # 400 rather than 401 so the frontend shows the message instead of treating it as an expired session.
        raise HTTPException(400, str(e))


@router.post("/logout")
def logout(token: str = Depends(bearer_token), session: Session = Depends(get_session)):
    auth.logout(session, token)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: Candidate = Depends(current_user)):
    return UserOut(id=user.id, email=user.email or "", name=user.name, role=user.role)
