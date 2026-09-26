"""Set a new password for an account (local admin tool; run from the backend/ folder).

    python scripts/reset_password.py abc@example.com "new-password-here"

Existing sessions for the account are signed out.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine, init_db  # noqa: E402
from app.models import Candidate, CandidateSession  # noqa: E402
from app.services.auth import hash_password  # noqa: E402

if len(sys.argv) != 3:
    sys.exit(__doc__)
email, password = sys.argv[1].strip().lower(), sys.argv[2]
if len(password) < 8:
    sys.exit("Password must be at least 8 characters.")

init_db()
with Session(engine) as session:
    user = session.exec(select(Candidate).where(Candidate.email == email)).first()
    if not user:
        sys.exit(f"No account with email {email}")
    user.password_hash = hash_password(password)
    session.add(user)
    for s in session.exec(select(CandidateSession).where(CandidateSession.candidate_id == user.id)).all():
        session.delete(s)
    session.commit()
    print(f"Password updated for {user.name} <{email}> ({user.role}).")
