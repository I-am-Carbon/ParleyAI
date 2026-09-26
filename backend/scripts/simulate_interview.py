"""Run a full interview in the terminal, with no frontend.

Usage (from the backend/ folder):
    python scripts/simulate_interview.py                  # you type the answers
    python scripts/simulate_interview.py --auto           # the LLM role-plays a candidate
    python scripts/simulate_interview.py --auto --persona weak
    python scripts/simulate_interview.py --resume path/to/resume.pdf --job-id 2 --mode practice
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.main import app  # noqa: E402
from app.services import llm  # noqa: E402

PERSONAS = {
    "strong": "You answer confidently with specific details, numbers and trade-offs from your experience.",
    "average": "You give reasonable but sometimes vague answers, occasionally missing depth.",
    "weak": "You are nervous, give short vague answers, and sometimes don't know the answer.",
}


def check(resp):
    if resp.status_code >= 400:
        print(f"\nERROR {resp.status_code}: {resp.text}")
        sys.exit(1)
    return resp.json()


SIM_PASSWORD = "simulator-password"


def account_headers(client, email: str, name: str, role: str = "candidate") -> dict:
    """Sign up (or sign in to) a throwaway simulator account and return auth headers."""
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "name": name, "password": SIM_PASSWORD, "role": role, "recruiter_code": config.RECRUITER_SIGNUP_CODE},
    )
    if resp.status_code == 400 and "already exists" in resp.text:
        resp = client.post("/api/auth/login", json={"email": email, "password": SIM_PASSWORD})
    return {"Authorization": f"Bearer {check(resp)['token']}"}


def candidate_answer(resume_text: str, persona: str, history: list[str], question: str) -> str:
    system = (
        "You are a job candidate in a spoken interview. Reply with only what you would say out loud, "
        f"in 2-5 sentences, first person, no markdown. {PERSONAS[persona]}\n\nYour resume:\n{resume_text}"
    )
    convo = "\n".join(history[-8:])
    return llm.complete_text(system, f"Conversation so far:\n{convo}\n\nInterviewer: {question}\n\nYour answer:")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", default=str(BACKEND_DIR / "samples" / "sample_resume.txt"))
    parser.add_argument("--job-id", type=int, default=1)
    parser.add_argument("--name", default="Priya Sharma")
    parser.add_argument("--email", default="priya.sim@example.com")
    parser.add_argument("--mode", choices=["recruiter", "practice"], default="recruiter")
    parser.add_argument("--level", choices=["fresher", "junior", "mid", "senior"], default="junior")
    parser.add_argument("--auto", action="store_true", help="let the LLM play the candidate")
    parser.add_argument("--persona", choices=list(PERSONAS), default="average")
    args = parser.parse_args()

    resume_path = Path(args.resume)
    with TestClient(app) as client:
        jobs = check(client.get("/api/jobs"))
        print("Jobs:", ", ".join(f"[{j['id']}] {j['title']}" for j in jobs))

        client.headers.update(account_headers(client, args.email, args.name))
        # Scores of recruiter-mode interviews are only visible to recruiters, so the debug output uses one.
        recruiter = (
            account_headers(client, "sim.recruiter@example.com", "Simulator Recruiter", "recruiter")
            if config.RECRUITER_SIGNUP_CODE
            else None
        )
        viewer = recruiter if args.mode == "recruiter" else client.headers

        print(f"\nParsing resume and planning interview for job {args.job_id}...")
        with resume_path.open("rb") as f:
            created = check(
                client.post(
                    "/api/interviews",
                    data={"job_id": args.job_id, "mode": args.mode, "experience_level": args.level},
                    files={"resume": (resume_path.name, f)},
                )
            )
        interview_id = created["id"]
        print(f"\nInterview #{interview_id} plan:")
        for i, t in enumerate(created["plan"], 1):
            print(f"  {i}. {t['title']} [{t['competency']}] - evidence: {t['resume_evidence']}")

        resume_text = resume_path.read_text(encoding="utf-8", errors="ignore") if resume_path.suffix == ".txt" else ""
        history: list[str] = []
        q = check(client.post(f"/api/interviews/{interview_id}/start"))
        print("\n" + "=" * 70 + "\nType 'quit' to end early.\n")

        while True:
            print(f"INTERVIEWER ({q['topic']}): {q['question']}\n")
            if q["done"]:
                break
            if args.auto:
                ans = candidate_answer(resume_text or json.dumps(created["profile"]), args.persona, history, q["question"])
                print(f"CANDIDATE: {ans}\n")
            else:
                ans = input("YOU: ").strip()
                print()
                if ans.lower() == "quit":
                    break
            history += [f"Interviewer: {q['question']}", f"Candidate: {ans}"]
            q = check(client.post(f"/api/interviews/{interview_id}/answer", json={"transcript": ans}))

            # Debug view: what the engine decided about the last answer (recruiter-only data).
            turns = check(client.get(f"/api/interviews/{interview_id}", headers=viewer))["turns"] if viewer else []
            last_eval = next((t["eval"] for t in reversed(turns) if t["eval"]), None)
            if last_eval:
                print(f"   [score {last_eval['answer_score']}/5 -> {last_eval['decision']}: {last_eval['rationale']}]\n")

        if args.mode == "recruiter":
            # Fake a few attention events so the integrity summary has something to show.
            check(
                client.post(
                    f"/api/interviews/{interview_id}/integrity",
                    json={
                        "events": [
                            {"type": "looking_away", "started_at_ms": 30_000, "duration_ms": 4_000},
                            {"type": "looking_away", "started_at_ms": 95_000, "duration_ms": 6_500},
                            {"type": "tab_hidden", "started_at_ms": 140_000, "duration_ms": 3_000},
                        ]
                    },
                )
            )

        print("Generating report...")
        check(client.post(f"/api/interviews/{interview_id}/finish"))
        if not viewer:
            print("Interview submitted. Set RECRUITER_SIGNUP_CODE in .env to print recruiter-mode reports here.")
            return
        data = check(client.get(f"/api/interviews/{interview_id}/report", headers=viewer))
        r = data["report"]

        print("\n" + "=" * 70)
        print(f"REPORT - {data['candidate']['name']} for {data['job']['title']}")
        print(f"Overall: {r['overall_score']}/100  Recommendation: {r['recommendation']}\n")
        for c in r["competency_scores"]:
            print(f"  {c['score']}/5  {c['competency']}: {c['comment']}")
            for quote in c["evidence"]:
                print(f'         "{quote}"')
        print("\nStrengths:\n" + "\n".join(f"  + {s}" for s in r["strengths"]))
        print("Gaps:\n" + "\n".join(f"  - {g}" for g in r["gaps"]))
        print(f"\nSummary: {r['summary']}")
        integ = r["integrity_summary"]
        if integ.get("enabled"):
            print(f"\nIntegrity: risk {integ['risk_level']}")
            for flag in integ["flags"]:
                print(f"  ! {flag}")
            print(f"  ({integ['note']})")


if __name__ == "__main__":
    main()
