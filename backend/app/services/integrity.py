"""Turns raw attention events from the browser into a recruiter-facing summary.

These are observations for human review only; they never change the evaluation score.
"""

from typing import Any

from app.models import IntegrityEvent

EVENT_TYPES = ("looking_away", "no_face", "multiple_faces", "tab_hidden", "camera_off")

NOTE = (
    "Automated observations for human review. They may have innocent explanations "
    "(thinking, poor lighting, notifications) and are not factored into the evaluation score."
)


END_REASON_TEXT = {
    "looking_away": "Interview ended automatically: the candidate looked away from the screen for more than 5 seconds.",
    "multiple_faces": "Interview ended automatically: more than one person was in view for more than 5 seconds.",
    "no_face": "Interview ended automatically: the candidate's face was not visible for more than 5 seconds.",
}


def summarize(
    events: list[IntegrityEvent], session_seconds: float, enabled: bool = True, end_reason: str | None = None
) -> dict[str, Any]:
    if not enabled:
        return {"enabled": False, "note": "Integrity monitoring is disabled in practice mode."}

    by_type = {t: {"count": 0, "total_seconds": 0.0} for t in EVENT_TYPES}
    for e in events:
        stats = by_type.setdefault(e.type, {"count": 0, "total_seconds": 0.0})
        stats["count"] += 1
        stats["total_seconds"] += e.duration_ms / 1000
    for stats in by_type.values():
        stats["total_seconds"] = round(stats["total_seconds"], 1)

    away_seconds = (
        by_type["looking_away"]["total_seconds"] + by_type["no_face"]["total_seconds"] + by_type["camera_off"]["total_seconds"]
    )
    away_percent = round(100 * away_seconds / session_seconds, 1) if session_seconds > 0 else 0.0

    flags = []
    if by_type["looking_away"]["count"] >= 5 or away_percent >= 15:
        flags.append(
            f"Looked away from the screen {by_type['looking_away']['count']} times "
            f"({away_percent}% of the session away or off-camera)."
        )
    if by_type["no_face"]["total_seconds"] >= 30:
        flags.append(f"Face not visible for {by_type['no_face']['total_seconds']} seconds in total.")
    if by_type["camera_off"]["total_seconds"] >= 10:
        flags.append(f"Camera was off or unavailable for {by_type['camera_off']['total_seconds']} seconds.")
    if by_type["multiple_faces"]["count"] > 0:
        flags.append(f"More than one face detected on {by_type['multiple_faces']['count']} occasion(s).")
    if by_type["tab_hidden"]["count"] > 0:
        flags.append(
            f"Switched away from the interview tab {by_type['tab_hidden']['count']} time(s) "
            f"({by_type['tab_hidden']['total_seconds']} seconds)."
        )

    if end_reason:
        flags.insert(0, END_REASON_TEXT.get(end_reason, f"Interview ended automatically ({end_reason})."))

    if end_reason or len(flags) >= 2 or by_type["multiple_faces"]["count"] > 0:
        risk_level = "high"
    elif flags:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "enabled": True,
        "session_seconds": round(session_seconds, 1),
        "by_type": by_type,
        "away_percent": away_percent,
        "flags": flags,
        "risk_level": risk_level,
        "end_reason": end_reason,
        "note": NOTE,
    }
