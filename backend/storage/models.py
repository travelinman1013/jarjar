"""Session, transcript, and score data models."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class Session(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scenario_name: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    duration_seconds: Optional[float] = None

    transcripts: list["TranscriptEntry"] = Relationship(back_populates="session")


class TranscriptEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    turn_id: int
    speaker: str  # "user" or "bot"
    text: str
    timestamp: float

    session: Optional[Session] = Relationship(back_populates="transcripts")
