from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.deps import require_recruiter
from app.models import Candidate, Job
from app.schemas import JobCreate

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=Job)
def create_job(body: JobCreate, session: Session = Depends(get_session), _: Candidate = Depends(require_recruiter)):
    job = Job(
        title=body.title,
        description=body.description,
        competencies=[c.model_dump() for c in body.competencies],
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.get("", response_model=list[Job])
def list_jobs(session: Session = Depends(get_session)):
    return session.exec(select(Job).order_by(Job.id.desc())).all()


@router.get("/{job_id}", response_model=Job)
def get_job(job_id: int, session: Session = Depends(get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job
