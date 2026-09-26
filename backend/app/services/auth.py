"""Accounts, password hashing and session tokens."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app import config
from app.models import Candidate, CandidateSession
from app.schemas import SignupRequest

PBKDF2_ITERATIONS = 200_000


class AuthError(RuntimeError):
    pass


# ---------- passwords ----------


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


# ---------- accounts ----------


def _normalize_email(email: str) -> str:
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1] or len(email) > 254:
        raise AuthError("Please enter a valid email address.")
    return email


def _find_by_email(session: Session, email: str) -> Candidate | None:
    return session.exec(select(Candidate).where(Candidate.email == email)).first()


def _new_session(session: Session, user: Candidate) -> CandidateSession:
    sess = CandidateSession(candidate_id=user.id, email=user.email or "", token=secrets.token_urlsafe(32))
    session.add(sess)
    session.commit()
    session.refresh(sess)
    return sess


def signup(session: Session, req: SignupRequest) -> tuple[Candidate, CandidateSession]:
    email = _normalize_email(req.email)
    if req.role == "recruiter":
        if not config.RECRUITER_SIGNUP_CODE:
            raise AuthError("Recruiter sign-up is disabled. Set RECRUITER_SIGNUP_CODE in backend/.env.")
        if not hmac.compare_digest((req.recruiter_code or "").strip(), config.RECRUITER_SIGNUP_CODE):
            raise AuthError("That recruiter access code is not valid.")

    user = _find_by_email(session, email)
    if user and user.password_hash:
        raise AuthError("An account with this email already exists. Sign in instead.")
    if user is None:
        user = Candidate(email=email, name="", resume_text="", resume_profile={})
    # Accounts created before passwords existed have no password yet; signing up claims them.
    user.name = req.name.strip()
    user.password_hash = hash_password(req.password)
    user.role = req.role
    session.add(user)
    session.commit()
    session.refresh(user)
    return user, _new_session(session, user)


def login(session: Session, email: str, password: str) -> tuple[Candidate, CandidateSession]:
    user = _find_by_email(session, email.strip().lower())
    if not user or not verify_password(password, user.password_hash):
        raise AuthError("Incorrect email or password.")
    return user, _new_session(session, user)


def logout(session: Session, token: str) -> None:
    sess = session.exec(select(CandidateSession).where(CandidateSession.token == token)).first()
    if sess:
        session.delete(sess)
        session.commit()


def validate_token(session: Session, token: str) -> Candidate:
    """Return the user for a session token, or raise if it is unknown or expired."""
    sess = session.exec(select(CandidateSession).where(CandidateSession.token == token)).first()
    if not sess:
        raise AuthError("Your session has ended. Please sign in again.")

    now = datetime.now(timezone.utc)
    created = sess.created_at if sess.created_at.tzinfo else sess.created_at.replace(tzinfo=timezone.utc)
    if now - created > timedelta(days=config.SESSION_DAYS):
        session.delete(sess)
        session.commit()
        raise AuthError("Your session has expired. Please sign in again.")

    user = session.get(Candidate, sess.candidate_id)
    if not user:
        raise AuthError("Account not found.")
    sess.last_accessed_at = now
    session.add(sess)
    session.commit()
    return user
