from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app import config

engine = create_engine(config.DATABASE_URL, connect_args={"check_same_thread": False})

# Columns added after the first release. create_all() doesn't alter existing tables,
# so add them to older databases here. {table: {column: DDL}}
_ADDED_COLUMNS = {
    "candidate": {
        "password_hash": "VARCHAR",
        "role": "VARCHAR NOT NULL DEFAULT 'candidate'",
    },
    "interview": {
        "results_shared": "BOOLEAN NOT NULL DEFAULT 0",
        "end_reason": "VARCHAR",
        "experience_level": "VARCHAR",
    },
}


def _migrate() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db() -> None:
    from app import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)
    _migrate()


def get_session():
    with Session(engine) as session:
        yield session
