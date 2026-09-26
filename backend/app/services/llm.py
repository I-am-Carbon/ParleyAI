"""Thin wrapper around any OpenAI-compatible chat API (Groq by default)."""

import json
from pathlib import Path
from string import Template
from typing import Optional, TypeVar

import openai
from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app import config

T = TypeVar("T", bound=BaseModel)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_client: Optional[OpenAI] = None


class LLMError(RuntimeError):
    pass


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not config.LLM_API_KEY:
            raise LLMError("LLM_API_KEY is not set. Copy backend/.env.example to backend/.env and add your Groq key.")
        _client = OpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY, timeout=60, max_retries=3)
    return _client


def render(prompt_name: str, **values) -> str:
    """Load app/prompts/<name>.md and fill $placeholders."""
    text = (PROMPTS_DIR / f"{prompt_name}.md").read_text(encoding="utf-8")
    return Template(text).safe_substitute({k: str(v) for k, v in values.items()})


def complete_json(
    system: str,
    user: str,
    schema: type[T],
    *,
    model: Optional[str] = None,
    temperature: float = 0.4,
    retries: int = 1,
) -> T:
    """Ask for a JSON object and validate it against `schema`, retrying once with the error on failure."""
    messages = [
        {
            "role": "system",
            "content": f"{system}\n\nRespond ONLY with a JSON object matching this JSON schema:\n"
            f"{json.dumps(schema.model_json_schema())}",
        },
        {"role": "user", "content": user},
    ]
    last_error: Exception | None = None
    for _ in range(retries + 1):
        try:
            resp = _get_client().chat.completions.create(
                model=model or config.LLM_MODEL_FAST,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
        except openai.BadRequestError as e:
            # Groq rejects malformed JSON output with a 400 (json_validate_failed); just retry.
            last_error = e
            continue
        text = resp.choices[0].message.content or ""
        try:
            return schema.model_validate_json(text)
        except ValidationError as e:
            last_error = e
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"That JSON did not match the schema: {e}. Return a corrected JSON object only."},
            ]
    raise LLMError(f"Model did not return valid JSON after {retries + 1} attempts: {last_error}")


def complete_text(system: str, user: str, *, model: Optional[str] = None, temperature: float = 0.7) -> str:
    resp = _get_client().chat.completions.create(
        model=model or config.LLM_MODEL_FAST,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
    )
    return (resp.choices[0].message.content or "").strip()
