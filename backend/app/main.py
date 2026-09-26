from contextlib import asynccontextmanager

import openai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.db import init_db
from app.routers import auth, interviews, jobs, reports
from app.seed import seed_jobs
from app.services.interview_engine import InterviewStateError
from app.services.llm import LLMError
from app.services.report import ReportError
from app.services.resume_parser import ResumeError


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_jobs()
    yield


app = FastAPI(title="AI Interview Bot API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(interviews.router)
app.include_router(reports.router)


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message})


@app.exception_handler(ResumeError)
async def _resume_error(_: Request, exc: ResumeError):
    return _error(400, str(exc))


@app.exception_handler(ReportError)
async def _report_error(_: Request, exc: ReportError):
    return _error(400, str(exc))


@app.exception_handler(InterviewStateError)
async def _state_error(_: Request, exc: InterviewStateError):
    return _error(409, str(exc))


@app.exception_handler(LLMError)
async def _llm_error(_: Request, exc: LLMError):
    return _error(502, str(exc))


@app.exception_handler(openai.RateLimitError)
async def _rate_limited(_: Request, exc: openai.RateLimitError):
    return _error(429, "The AI provider's rate limit was reached. Wait a few seconds and try again.")


@app.exception_handler(openai.NotFoundError)
async def _model_not_found(_: Request, exc: openai.NotFoundError):
    return _error(
        502,
        f"The AI model '{config.LLM_MODEL_FAST}' isn't available from your provider. "
        "Run `python scripts/list_models.py` in backend/ and set LLM_MODEL_FAST / LLM_MODEL_REPORT in .env.",
    )


@app.exception_handler(openai.APIError)
async def _provider_error(_: Request, exc: openai.APIError):
    return _error(502, f"AI provider error: {exc}")


@app.get("/api/health")
def health():
    return {"status": "ok", "model": config.LLM_MODEL_FAST, "llm_configured": bool(config.LLM_API_KEY)}
