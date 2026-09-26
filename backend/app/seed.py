"""Demo jobs, inserted on first startup so the app is usable immediately."""

from sqlmodel import Session, select

from app.db import engine
from app.models import Job

DEMO_JOBS = [
    Job(
        title="Backend Engineer (Python)",
        description=(
            "Build and operate REST APIs and data pipelines in Python. Work with SQL databases, "
            "cloud services and CI/CD. Own features end to end, write tests, and collaborate with "
            "frontend and product teams. 1-3 years of experience."
        ),
        competencies=[
            {"name": "Python & API design", "weight": 1.5, "description": "Clean Python, REST design, frameworks"},
            {"name": "Databases & data modelling", "weight": 1.0, "description": "SQL, schema design, performance"},
            {"name": "System design & scalability", "weight": 1.0, "description": "Trade-offs, caching, reliability"},
            {"name": "Problem solving & debugging", "weight": 1.5, "description": "Structured reasoning about issues"},
            {"name": "Communication & collaboration", "weight": 1.0, "description": "Clarity, teamwork, ownership"},
        ],
    ),
    Job(
        title="Frontend Engineer (React)",
        description=(
            "Build responsive, accessible web interfaces with React and TypeScript. Integrate with "
            "REST APIs, manage state, optimise performance and work closely with designers. "
            "0-2 years of experience."
        ),
        competencies=[
            {"name": "React & TypeScript", "weight": 1.5, "description": "Components, hooks, typing"},
            {"name": "UI engineering & accessibility", "weight": 1.0, "description": "CSS, responsive, a11y"},
            {"name": "State management & APIs", "weight": 1.0, "description": "Data fetching, caching, state"},
            {"name": "Problem solving & debugging", "weight": 1.5, "description": "Structured reasoning about issues"},
            {"name": "Communication & collaboration", "weight": 1.0, "description": "Clarity, teamwork, ownership"},
        ],
    ),
]


def seed_jobs() -> None:
    with Session(engine) as session:
        if session.exec(select(Job)).first():
            return
        for job in DEMO_JOBS:
            session.add(Job(title=job.title, description=job.description, competencies=job.competencies))
        session.commit()
