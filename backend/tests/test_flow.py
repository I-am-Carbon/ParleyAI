"""End-to-end API flow with a fake LLM (no API key or network needed)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import (
    CompetencyScore,
    EvaluationReport,
    InterviewPlan,
    ResumeProfile,
    Topic,
    TurnEval,
)
from app.services import llm

RESUME = Path(__file__).resolve().parent.parent / "samples" / "sample_resume.txt"


def fake_complete_json(system, user, schema, **kwargs):
    if schema is ResumeProfile:
        return ResumeProfile(name="Priya Sharma", skills=["Python", "FastAPI"])
    if schema is InterviewPlan:
        return InterviewPlan(
            topics=[
                Topic(competency=f"Comp {i}", title=f"Topic {i}", resume_evidence="x", opening_question=f"Q{i}?")
                for i in range(3)
            ]
        )
    if schema is TurnEval:
        # Always try to keep probing; the engine's rules must still move the interview forward.
        return TurnEval(answer_score=4, signals=["specific"], decision="probe_deeper", next_question="Tell me more?")
    if schema is EvaluationReport:
        return EvaluationReport(
            competency_scores=[
                CompetencyScore(competency="Python & API design", score=4, evidence=["I built the API"]),
                CompetencyScore(competency="Problem solving & debugging", score=3),
            ],
            strengths=["Specific examples"],
            gaps=["System design depth"],
            summary="Solid candidate.",
        )
    raise AssertionError(f"unexpected schema {schema}")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", fake_complete_json)
    with TestClient(app) as c:
        yield c


def create_interview(client, token: str, mode="recruiter"):
    with RESUME.open("rb") as f:
        resp = client.post(
            "/api/interviews",
            data={"job_id": 1, "mode": mode},
            files={"resume": ("resume.txt", f)},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()


_accounts = 0


def signup(client, role="candidate", name="Test Candidate") -> str:
    """Create a fresh account (unique email per call) and return its token."""
    global _accounts
    _accounts += 1
    body = {"email": f"user{_accounts}@example.com", "name": name, "password": "correct-horse", "role": role}
    if role == "recruiter":
        body["recruiter_code"] = "test-recruiter-code"
    resp = client.post("/api/auth/signup", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_full_interview_flow(client):
    assert len(client.get("/api/jobs").json()) >= 2  # seeded
    token = signup(client)
    recruiter = auth(signup(client, role="recruiter", name="Rita Recruiter"))

    interview = create_interview(client, token)
    iid = interview["id"]
    assert len(interview["plan"]) == 3

    headers = auth(token)
    q = client.post(f"/api/interviews/{iid}/start", headers=headers).json()
    assert "Test" in q["question"] and q["done"] is False
    # start is idempotent
    assert client.post(f"/api/interviews/{iid}/start", headers=headers).json()["turn_idx"] == q["turn_idx"]

    # empty answer does not advance
    retry = client.post(f"/api/interviews/{iid}/answer", json={"transcript": "  "}, headers=headers).json()
    assert retry["turn_idx"] == q["turn_idx"]

    answers = 0
    while not q["done"]:
        q = client.post(f"/api/interviews/{iid}/answer", json={"transcript": "My answer", "duration_s": 20}, headers=headers).json()
        answers += 1
        assert answers < 20, "interview never ended"

    # 3 topics x (1 opening + 2 follow-ups) = 9 answers, then the closing message
    assert answers == 9
    detail = client.get(f"/api/interviews/{iid}", headers=headers).json()
    assert detail["status"] == "completed"
    per_topic = {}
    for t in detail["turns"]:
        per_topic[t["topic"]] = per_topic.get(t["topic"], 0) + 1
    assert per_topic == {"Topic 0": 3, "Topic 1": 3, "Topic 2": 3, "Closing": 1}

    # answering after completion is rejected
    assert client.post(f"/api/interviews/{iid}/answer", json={"transcript": "x"}, headers=headers).status_code == 409

    events = [
        {"type": "looking_away", "started_at_ms": 1000, "duration_ms": 3000},
        {"type": "multiple_faces", "started_at_ms": 5000, "duration_ms": 2000},
    ]
    assert client.post(f"/api/interviews/{iid}/integrity", json={"events": events}, headers=headers).json() == {"accepted": 2}
    camera = {"type": "camera_off", "started_at_ms": 8000, "duration_ms": 12000}
    body = {"events": [camera], "baseline_pose": {"yaw": 2.5, "pitch": -4.0}}
    assert client.post(f"/api/interviews/{iid}/integrity", json=body, headers=headers).json() == {"accepted": 1}
    bad = {"events": [{"type": "cheating", "started_at_ms": 0, "duration_ms": 1}]}
    assert client.post(f"/api/interviews/{iid}/integrity", json=bad, headers=headers).status_code == 422

    finished = client.post(f"/api/interviews/{iid}/finish", headers=headers).json()
    assert finished["results_visible"] is False and finished["overall_score"] is None

    # The candidate can't see the evaluation of a real interview...
    assert client.get(f"/api/interviews/{iid}/report", headers=headers).status_code == 403
    mine = client.get("/api/interviews", headers=headers).json()
    assert mine[0]["id"] == iid and mine[0]["overall_score"] is None and mine[0]["has_report"] is True
    assert all(t["eval"] is None for t in client.get(f"/api/interviews/{iid}", headers=headers).json()["turns"])

    # ...but the recruiter can.
    data = client.get(f"/api/interviews/{iid}/report", headers=recruiter).json()
    report = data["report"]
    # weighted: (1.5*4 + 1.5*3) / 3 = 3.5 -> (3.5-1)/4*100 = 62.5 -> 62 ("maybe")
    assert report["overall_score"] == 62
    assert report["recommendation"] == "maybe"
    assert report["integrity_summary"]["risk_level"] == "high"
    assert report["integrity_summary"]["by_type"]["camera_off"] == {"count": 1, "total_seconds": 12.0}
    assert any("Camera was off" in f for f in report["integrity_summary"]["flags"])
    assert len(data["integrity_events"]) == 3
    assert len(data["transcript"]) == 10

    listing = client.get("/api/interviews", headers=recruiter).json()
    row = next(r for r in listing if r["id"] == iid)
    assert row["overall_score"] == 62 and row["candidate_name"] == "Test Candidate"
    assert row["results_shared"] is False

    # Only a recruiter can release results to the candidate.
    assert client.post(f"/api/interviews/{iid}/share", json={"shared": True}, headers=headers).status_code == 403
    assert client.post(f"/api/interviews/{iid}/share", json={"shared": True}, headers=recruiter).json()["results_shared"] is True

    shared = client.get(f"/api/interviews/{iid}/report", headers=headers).json()
    assert shared["report"]["overall_score"] == 62 and shared["results_shared"] is True
    # ...but integrity observations stay with the hiring team.
    assert shared["report"]["integrity_summary"]["enabled"] is False and shared["integrity_events"] == []
    mine = client.get("/api/interviews", headers=headers).json()[0]
    assert mine["overall_score"] == 62 and mine["integrity_risk"] is None

    # Withdrawing hides it again.
    client.post(f"/api/interviews/{iid}/share", json={"shared": False}, headers=recruiter)
    assert client.get(f"/api/interviews/{iid}/report", headers=headers).status_code == 403


def test_practice_mode_ignores_integrity(client):
    token = signup(client)
    iid = create_interview(client, token, mode="practice")["id"]
    headers = auth(token)
    client.post(f"/api/interviews/{iid}/start", headers=headers)
    client.post(f"/api/interviews/{iid}/answer", json={"transcript": "An answer"}, headers=headers)
    events = [{"type": "tab_hidden", "started_at_ms": 0, "duration_ms": 1000}]
    assert client.post(f"/api/interviews/{iid}/integrity", json={"events": events}, headers=headers).json() == {"accepted": 0}
    client.post(f"/api/interviews/{iid}/finish", headers=headers)
    # Practice feedback is for the candidate.
    report = client.get(f"/api/interviews/{iid}/report", headers=headers).json()["report"]
    assert report["integrity_summary"]["enabled"] is False
    assert client.get("/api/interviews", headers=headers).json()[0]["overall_score"] is not None
    # Sharing only applies to recruiter interviews.
    recruiter = auth(signup(client, role="recruiter"))
    assert client.post(f"/api/interviews/{iid}/share", json={"shared": True}, headers=recruiter).status_code == 400


def test_auto_ended_interview(client):
    token = signup(client)
    recruiter = auth(signup(client, role="recruiter"))
    iid = create_interview(client, token)["id"]
    client.post(f"/api/interviews/{iid}/start", headers=auth(token))
    client.post(f"/api/interviews/{iid}/answer", json={"transcript": "An answer"}, headers=auth(token))
    events = {"events": [{"type": "looking_away", "started_at_ms": 4000, "duration_ms": 5200}]}
    client.post(f"/api/interviews/{iid}/integrity", json=events, headers=auth(token))

    resp = client.post(f"/api/interviews/{iid}/finish", json={"reason": "looking_away"}, headers=auth(token))
    assert resp.status_code == 200
    data = client.get(f"/api/interviews/{iid}/report", headers=recruiter).json()
    assert data["end_reason"] == "looking_away"
    summary = data["report"]["integrity_summary"]
    assert summary["risk_level"] == "high" and summary["flags"][0].startswith("Interview ended automatically")
    assert data["report"]["overall_score"] == 62  # the answers given are still evaluated normally


def test_auto_ended_before_any_answer(client):
    token = signup(client)
    recruiter = auth(signup(client, role="recruiter"))
    iid = create_interview(client, token)["id"]
    client.post(f"/api/interviews/{iid}/start", headers=auth(token))
    resp = client.post(f"/api/interviews/{iid}/finish", json={"reason": "multiple_faces"}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    report = client.get(f"/api/interviews/{iid}/report", headers=recruiter).json()["report"]
    assert report["overall_score"] == 0 and report["recommendation"] == "no"
    assert "more than one person" in report["integrity_summary"]["flags"][0]


def test_auto_ended_face_not_visible(client):
    token = signup(client)
    recruiter = auth(signup(client, role="recruiter"))
    iid = create_interview(client, token)["id"]
    client.post(f"/api/interviews/{iid}/start", headers=auth(token))
    assert client.post(f"/api/interviews/{iid}/finish", json={"reason": "no_face"}, headers=auth(token)).status_code == 200
    data = client.get(f"/api/interviews/{iid}/report", headers=recruiter).json()
    assert data["end_reason"] == "no_face"
    assert "face was not visible" in data["report"]["integrity_summary"]["flags"][0]
    # unknown reasons are rejected
    other = create_interview(client, token)["id"]
    client.post(f"/api/interviews/{other}/start", headers=auth(token))
    assert client.post(f"/api/interviews/{other}/finish", json={"reason": "sneezed"}, headers=auth(token)).status_code == 422


def test_cannot_share_before_finished(client):
    token = signup(client)
    recruiter = auth(signup(client, role="recruiter"))
    iid = create_interview(client, token)["id"]
    assert client.post(f"/api/interviews/{iid}/share", json={"shared": True}, headers=recruiter).status_code == 409


def test_passwords_and_sessions(client):
    body = {"email": "Pat@Example.com", "name": "Pat", "password": "s3cret-pass"}
    assert client.post("/api/auth/signup", json=body).status_code == 200
    # duplicate email (case-insensitive) is rejected
    assert client.post("/api/auth/signup", json={**body, "email": "pat@example.com"}).status_code == 400
    # wrong password / unknown email
    assert client.post("/api/auth/login", json={"email": "pat@example.com", "password": "nope-nope"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "whatever1"}).status_code == 400
    # short password
    assert client.post("/api/auth/signup", json={**body, "email": "x@example.com", "password": "short"}).status_code == 422

    token = client.post("/api/auth/login", json={"email": "pat@example.com", "password": "s3cret-pass"}).json()["token"]
    me = client.get("/api/auth/me", headers=auth(token)).json()
    assert me["name"] == "Pat" and me["role"] == "candidate"

    client.post("/api/auth/logout", headers=auth(token))
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 401
    assert client.get("/api/interviews").status_code == 401


def test_recruiter_signup_needs_code(client):
    body = {"email": "r@example.com", "name": "R", "password": "recruit-pass", "role": "recruiter"}
    assert client.post("/api/auth/signup", json={**body, "recruiter_code": "wrong"}).status_code == 400
    assert client.post("/api/auth/signup", json=body).status_code == 400


def test_access_rules(client):
    owner = signup(client)
    other = signup(client, name="Someone Else")
    recruiter = signup(client, role="recruiter")
    iid = create_interview(client, owner, mode="practice")["id"]
    client.post(f"/api/interviews/{iid}/start", headers=auth(owner))
    client.post(f"/api/interviews/{iid}/answer", json={"transcript": "An answer"}, headers=auth(owner))
    client.post(f"/api/interviews/{iid}/finish", headers=auth(owner))

    # Another candidate can't see or touch it (404 hides that it exists).
    for method, path in [("get", ""), ("get", "/report"), ("post", "/start"), ("post", "/finish")]:
        assert getattr(client, method)(f"/api/interviews/{iid}{path}", headers=auth(other)).status_code == 404
    assert all(i["id"] != iid for i in client.get("/api/interviews", headers=auth(other)).json())
    # No token at all
    assert client.get(f"/api/interviews/{iid}/report").status_code == 401

    # Recruiters can view but not take interviews, and only they can create jobs.
    assert client.get(f"/api/interviews/{iid}/report", headers=auth(recruiter)).status_code == 200
    assert client.post(f"/api/interviews/{iid}/start", headers=auth(recruiter)).status_code == 404
    with RESUME.open("rb") as f:
        resp = client.post("/api/interviews", data={"job_id": 1}, files={"resume": ("r.txt", f)}, headers=auth(recruiter))
    assert resp.status_code == 403
    job = {"title": "Data Analyst", "description": "SQL and dashboards"}
    assert client.post("/api/jobs", json=job, headers=auth(owner)).status_code == 403
    assert client.post("/api/jobs", json=job, headers=auth(recruiter)).status_code == 200


def test_bad_resume_rejected(client):
    token = signup(client)
    resp = client.post(
        "/api/interviews",
        data={"job_id": 1},
        files={"resume": ("resume.png", b"not a resume")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
