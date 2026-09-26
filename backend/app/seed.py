"""Built-in roles. On startup, any role whose title isn't in the database yet is added."""

from sqlmodel import Session, select

from app.db import engine
from app.models import Interview, Job

COMMUNICATION = {"name": "Communication & collaboration", "weight": 1.0, "description": "Clarity, teamwork, ownership"}
PROBLEM_SOLVING = {"name": "Problem solving & debugging", "weight": 1.5, "description": "Structured reasoning about issues"}

DEMO_JOBS = [
    {
        "title": "Backend Engineer (Python)",
        "description": (
            "Build and operate REST APIs and data pipelines in Python. Work with SQL databases, cloud services and "
            "CI/CD. Own features end to end, write tests, and collaborate with frontend and product teams. "
            "1-3 years of experience."
        ),
        "competencies": [
            {"name": "Python & API design", "weight": 1.5, "description": "Clean Python, REST design, frameworks"},
            {"name": "Databases & data modelling", "weight": 1.0, "description": "SQL, schema design, performance"},
            {"name": "System design & scalability", "weight": 1.0, "description": "Trade-offs, caching, reliability"},
            PROBLEM_SOLVING,
            COMMUNICATION,
        ],
    },
    {
        "title": "Frontend Engineer (React)",
        "description": (
            "Build responsive, accessible web interfaces with React and TypeScript. Integrate with REST APIs, manage "
            "state, optimise performance and work closely with designers. 0-2 years of experience."
        ),
        "competencies": [
            {"name": "React & TypeScript", "weight": 1.5, "description": "Components, hooks, typing"},
            {"name": "UI engineering & accessibility", "weight": 1.0, "description": "CSS, responsive, a11y"},
            {"name": "State management & APIs", "weight": 1.0, "description": "Data fetching, caching, state"},
            PROBLEM_SOLVING,
            COMMUNICATION,
        ],
    },
    {
        "title": "Machine Learning Engineer",
        "description": (
            "Design, train and deploy machine learning models to production. Build data and training pipelines, "
            "evaluate models rigorously, and serve them reliably at scale with monitoring for drift. Python, "
            "PyTorch or TensorFlow, scikit-learn, and MLOps tooling. 1-3 years of experience."
        ),
        "competencies": [
            {"name": "ML fundamentals", "weight": 1.5, "description": "Algorithms, bias/variance, loss functions, regularisation"},
            {"name": "Model evaluation & experimentation", "weight": 1.0, "description": "Metrics, validation, error analysis"},
            {"name": "Data pipelines & feature engineering", "weight": 1.0, "description": "Data quality, features, leakage"},
            {"name": "MLOps & deployment", "weight": 1.0, "description": "Serving, monitoring, retraining, reproducibility"},
            COMMUNICATION,
        ],
    },
    {
        "title": "DevOps Engineer",
        "description": (
            "Build and run the infrastructure and delivery pipelines that ship our software. Automate CI/CD, manage "
            "containers and Kubernetes, define infrastructure as code, and keep systems observable and reliable. "
            "Linux, Docker, Kubernetes, Terraform, a major cloud provider. 1-3 years of experience."
        ),
        "competencies": [
            {"name": "CI/CD & automation", "weight": 1.5, "description": "Pipelines, testing gates, release strategies"},
            {"name": "Containers & orchestration", "weight": 1.0, "description": "Docker, Kubernetes, scaling"},
            {"name": "Infrastructure as code & cloud", "weight": 1.0, "description": "Terraform, networking, IAM"},
            {"name": "Monitoring & incident response", "weight": 1.0, "description": "Observability, on-call, postmortems"},
            PROBLEM_SOLVING,
        ],
    },
    {
        "title": "Cloud Engineer (AWS)",
        "description": (
            "Design, secure and operate cloud infrastructure on AWS. Build scalable, cost-efficient architectures with "
            "EC2, S3, RDS, Lambda and VPC networking, and automate them with infrastructure as code. "
            "1-3 years of experience."
        ),
        "competencies": [
            {"name": "Cloud architecture", "weight": 1.5, "description": "Scalable, highly available designs"},
            {"name": "Networking & security", "weight": 1.0, "description": "VPCs, IAM, encryption, least privilege"},
            {"name": "Automation & IaC", "weight": 1.0, "description": "Terraform/CloudFormation, scripting"},
            {"name": "Cost & reliability", "weight": 1.0, "description": "Right-sizing, backups, disaster recovery"},
            COMMUNICATION,
        ],
    },
    {
        "title": "Data Analyst",
        "description": (
            "Answer business questions with data. Write SQL, build dashboards, define and track KPIs, and present "
            "clear recommendations to stakeholders. SQL, Excel, a BI tool such as Power BI or Tableau. "
            "0-2 years of experience."
        ),
        "competencies": [
            {"name": "SQL & querying", "weight": 1.5, "description": "Joins, aggregations, window functions"},
            {"name": "Data visualisation & dashboards", "weight": 1.0, "description": "Choosing charts, BI tools"},
            {"name": "Business metrics & analysis", "weight": 1.0, "description": "KPIs, trends, root causes"},
            PROBLEM_SOLVING,
            COMMUNICATION,
        ],
    },
    {
        "title": "Cybersecurity Analyst",
        "description": (
            "Protect systems and data. Monitor for threats, investigate and respond to incidents, assess "
            "vulnerabilities, and help teams build securely. Networking, SIEM tools, OWASP Top 10. "
            "0-3 years of experience."
        ),
        "competencies": [
            {"name": "Security fundamentals", "weight": 1.5, "description": "Threats, CIA triad, common attacks"},
            {"name": "Threat detection & incident response", "weight": 1.0, "description": "Logs, SIEM, triage"},
            {"name": "Network & application security", "weight": 1.0, "description": "Protocols, OWASP, hardening"},
            PROBLEM_SOLVING,
            COMMUNICATION,
        ],
    },
]

# Built-in roles that were dropped. Removed on startup unless an interview already uses them.
RETIRED_TITLES = [
    "Data Scientist",
    "Full-Stack Developer",
    "Android Developer",
    "QA Automation Engineer",
]


def seed_jobs() -> None:
    with Session(engine) as session:
        for job in session.exec(select(Job).where(Job.title.in_(RETIRED_TITLES))).all():
            if not session.exec(select(Interview.id).where(Interview.job_id == job.id)).first():
                session.delete(job)
        session.commit()

        existing = set(session.exec(select(Job.title)).all())
        for job in DEMO_JOBS:
            if job["title"] not in existing:
                session.add(Job(title=job["title"], description=job["description"], competencies=job["competencies"]))
        session.commit()
