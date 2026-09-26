# ParleyAI

AI-powered interview platform: resume-aware questions, adaptive spoken interviews, evaluation reports, and interview integrity monitoring. See `PROJECT_SPEC.md`.

**Requirements:** Chrome or Edge (for browser speech recognition). Two terminals for backend and frontend.

## Running the app

1. **Backend** (in one terminal):
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
   ```
   API at http://localhost:8000

2. **Frontend** (in another terminal):
   ```powershell
   cd frontend
   npm run dev
   ```
   App at http://localhost:5173 (auto-opens in Chrome/Edge)

## Backend (FastAPI + SQLite + Groq)

### Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env      # then paste your Groq key into LLM_API_KEY
```

Get a free Groq key at https://console.groq.com/keys. Any OpenAI-compatible provider works; see `.env.example` for the Gemini backup settings.

Model names change often. To see which models your key can use:

```powershell
.\.venv\Scripts\python.exe scripts\list_models.py
```

### Accounts

- **Candidates** sign up with name, email and password, and take interviews.
- **Recruiters** sign up with the access code from `RECRUITER_SIGNUP_CODE` in `backend/.env`. They see every recruiter-mode interview with scores, recommendations and integrity observations, but can't take interviews.
- Candidates see full feedback for **practice** sessions only. For **recruiter** interviews they see "Submitted"; the evaluation goes to the hiring team.
- Passwords are hashed with PBKDF2-SHA256. Sessions expire after `SESSION_DAYS` (default 7), and logging out revokes the session.

### Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs. Two demo jobs are seeded on first start.

### Try an interview in the terminal (no frontend needed)

```powershell
.\.venv\Scripts\python.exe scripts\simulate_interview.py                  # you type answers
.\.venv\Scripts\python.exe scripts\simulate_interview.py --auto           # LLM plays the candidate
.\.venv\Scripts\python.exe scripts\simulate_interview.py --auto --persona weak
.\.venv\Scripts\python.exe scripts\simulate_interview.py --mode practice --job-id 2
```

### Tests (offline, fake LLM)

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests
```

## Frontend (React + Vite + Tailwind)

Pages:

1. **Sign in / create account.** Choose a candidate or recruiter account.
2. **Candidate dashboard.** Your interviews, their status and practice scores.
3. **Recruiter dashboard.** All candidates' interviews, with search, status filters, scores, recommendations and integrity risk.
4. **New interview.** Pick a role, upload your resume, choose recruiter or practice mode.
5. **Interview room.** Live spoken conversation:
   - The browser reads each question aloud, then listens (Web Speech API, Chrome/Edge only).
   - Your answer appears as live captions; submit with the button or Ctrl+Enter. You can type instead of speaking.
   - An animated interviewer shows when it's speaking, listening or thinking, with a topic progress bar and transcript panel.
6. **Report.** Scores per competency with quotes, strengths, gaps, transcript and integrity timeline. Export to PDF via print.

**Note:** Speech features only work in Chrome or Edge.

## API

All endpoints except sign-up, login and `GET /api/jobs` need `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | anyone | `{name, email, password, role, recruiter_code?}` → token |
| POST | `/api/auth/login` | anyone | `{email, password}` → token |
| POST | `/api/auth/logout` | signed in | Revokes the current session |
| GET | `/api/auth/me` | signed in | Current user |
| POST | `/api/jobs` | recruiter | Create a job (title, description, competencies with weights) |
| GET | `/api/jobs` | anyone | List jobs |
| POST | `/api/interviews` | candidate | Multipart: `resume` file, `job_id`, `mode` (`recruiter`/`practice`). Parses resume, builds plan |
| GET | `/api/interviews` | signed in | Recruiters: all interviews. Candidates: their own (no scores for recruiter-mode) |
| GET | `/api/interviews/{id}` | owner or recruiter | Detail: plan, state, turns (per-answer evals for recruiters and practice only) |
| POST | `/api/interviews/{id}/start` | owner | Returns the first question (idempotent) |
| POST | `/api/interviews/{id}/answer` | owner | `{transcript, duration_s}` → next question, `done` flag |
| POST | `/api/interviews/{id}/integrity` | owner | `{events: [{type, started_at_ms, duration_ms, meta}], baseline_pose?}` |
| POST | `/api/interviews/{id}/finish` | owner | Ends the interview (early or after wrap-up) and generates the report |
| GET | `/api/interviews/{id}/report` | recruiter, or owner for practice | Report, transcript, integrity events |

Interviews you can't access return 404, so other people's interview IDs aren't revealed.

Integrity event types: `looking_away`, `no_face`, `multiple_faces`, `tab_hidden`.

## Interview integrity monitoring

Recruiter-mode interviews use the webcam to note attention; practice sessions don't.

- **On-device only.** MediaPipe Face Landmarker runs in the browser (loaded from a CDN on first use, so it needs internet). Video is never recorded or uploaded; only events are sent: `{type, started_at_ms, duration_ms}`.
- **Consent first.** The lobby explains what's monitored, shows a camera preview and requires a checkbox before joining.
- **Calibrated per person.** The first ~1.5 s of steady frames, taken again when the interview starts, set the candidate's own "looking at the screen" head pose *and* eye position, so an off-centre webcam isn't read as looking away. Head measurements are taken along the face's own axes, so tilting the head doesn't affect them; frames are smoothed over ~0.5 s.
- **Auto-end.** Looking away, the face being out of view, or another person in view, for more than 5 s, ends the interview (after a visible countdown from 2 s). The candidate is told this before joining. The recruiter sees an "Auto-ended" badge, a banner on the report, and a high-risk integrity flag; answers given before that are still evaluated.
- **What's detected** (`frontend/src/lib/attention.ts`):
  - `looking_away`: head turned or tilted, or eyes looking sideways/up, for 2 s or more. Looking down is ignored while typing.
  - `no_face`: no face in view for 2 s or more.
  - `multiple_faces`: a second person in view for 1 s or more.
  - `tab_hidden`: the interview tab was hidden.
  - `camera_off`: the camera stopped during the interview.
- **Debounced.** Glances and blinks don't count, and brief flickers don't split events.
- Events are sent every 5 s and flushed before the report is generated. The recruiter's report shows counts, a timeline and flags; candidates never see them, even when results are shared.
- Thresholds are heuristics (`THRESHOLDS` in `attention.ts`); tune them if you see false positives.

## How the interview adapts

For each answer the LLM returns a score (1-5), signals, a decision and the next spoken line. The engine (`app/services/interview_engine.py`) limits which decisions are allowed:

- `probe_deeper` / `simplify`: at most 2 follow-ups per topic, and `simplify` at most once per topic
- `next_topic` / `wrap_up`: always available as the way forward; forced when follow-ups or the turn/time budget (14 turns, 25 minutes) run out

The overall score and recommendation are computed deterministically from the weighted competency scores. Integrity observations are reported separately and never affect the score.
