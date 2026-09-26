"""Experience levels: how to pitch the interview and what to expect when scoring."""

from typing import Literal, Optional

Level = Literal["fresher", "junior", "mid", "senior"]

LEVELS: dict[str, dict[str, str]] = {
    "fresher": {
        "label": "Fresher (0 years: student or new graduate)",
        "plan": (
            "Focus on fundamentals, academic and personal projects, internships and learning ability. Ask about "
            "concepts and how they would approach a problem, not about production experience they cannot have yet."
        ),
        "scoring": (
            "Expect solid fundamentals, clear reasoning and curiosity. Do not penalise a lack of professional or "
            "production experience."
        ),
    },
    "junior": {
        "label": "1-2 years of experience",
        "plan": (
            "Focus on hands-on implementation, debugging, the tools they use, and what they personally built in their "
            "recent work. Design questions are fine at the level of a single feature."
        ),
        "scoring": (
            "Expect practical, hands-on competence and growing independence. System-level architecture is a bonus, "
            "not a requirement."
        ),
    },
    "mid": {
        "label": "3-5 years of experience",
        "plan": (
            "Focus on design decisions and trade-offs, owning features end to end, production issues they have "
            "handled, and code quality and testing practices."
        ),
        "scoring": "Expect independent ownership, sound reasoning about trade-offs, and real production experience.",
    },
    "senior": {
        "label": "5+ years of experience (senior)",
        "plan": (
            "Focus on system design at scale, architecture and technical strategy, handling ambiguity, leading "
            "projects, mentoring and influencing other teams. Probe for depth: why, alternatives, failure modes."
        ),
        "scoring": (
            "Expect depth, breadth and leadership. Answers that show only implementation-level knowledge should "
            "score lower at this level."
        ),
    },
}

_UNSPECIFIED = {
    "label": "Not specified",
    "plan": "Infer the appropriate level from the resume and pitch the questions accordingly.",
    "scoring": "Judge against what is typical for the experience shown on the resume.",
}


def level_info(level: Optional[str]) -> dict[str, str]:
    return LEVELS.get(level or "", _UNSPECIFIED)
