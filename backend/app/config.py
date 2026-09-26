import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# LLM (any OpenAI-compatible API; Groq by default)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL_FAST = os.getenv("LLM_MODEL_FAST", "llama-3.3-70b-versatile")
LLM_MODEL_REPORT = os.getenv("LLM_MODEL_REPORT", LLM_MODEL_FAST)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'interview.db').as_posix()}")
# Auth
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "7"))
# Anyone who knows this code can create a recruiter account. Empty = recruiter sign-up disabled.
RECRUITER_SIGNUP_CODE = os.getenv("RECRUITER_SIGNUP_CODE", "")

CORS_ORIGINS =[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

# Interview shape
NUM_TOPICS = 5
MAX_FOLLOWUPS_PER_TOPIC = 2
MAX_TURNS = 14
MAX_MINUTES = 25
INTERVIEWER_NAME = "John"
