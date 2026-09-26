import io

from docx import Document
from pypdf import PdfReader

from app.schemas import ResumeProfile
from app.services import llm

MAX_CHARS = 12_000


class ResumeError(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif name.endswith(".docx"):
            doc = Document(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs)
        elif name.endswith((".txt", ".md")):
            text = data.decode("utf-8", errors="ignore")
        else:
            raise ResumeError("Unsupported resume format. Upload a PDF, DOCX or TXT file.")
    except ResumeError:
        raise
    except Exception as e:
        raise ResumeError(f"Could not read the resume file: {e}") from e

    text = text.strip()
    if len(text) < 50:
        raise ResumeError("Could not extract enough text from the resume (is it a scanned image?).")
    return text[:MAX_CHARS]


def parse_profile(resume_text: str) -> ResumeProfile:
    return llm.complete_json(llm.render("resume"), resume_text, ResumeProfile, temperature=0.1)
