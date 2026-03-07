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
    score: Optional["Score"] = Relationship(back_populates="session")


class TranscriptEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    turn_id: int
    speaker: str  # "user" or "bot"
    text: str
    timestamp: float
    phase: Optional[str] = None

    session: Optional[Session] = Relationship(back_populates="transcripts")


class Score(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id", unique=True)
    overall_score: int
    clarity_score: int
    structure_score: int
    depth_score: int
    best_moment: str
    biggest_opportunity: str
    filler_word_count: int
    technical_accuracy_notes: str = ""
    dimension_names: str = ""  # JSON list of dynamic dimension names

    session: Optional[Session] = Relationship(back_populates="score")


class PhaseScore(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    phase_name: str
    phase_display_name: str
    phase_order: int
    dimension_scores: str  # JSON: [{dimension, score, rubric_level, evidence_quote, suggestion}]
    phase_summary: str
    stronger_answer: str


class DiagramSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    phase_name: str
    phase_display_name: str
    snapshot_json: str  # Full tldraw store snapshot for review rendering
    serialized_text: str  # Pre-computed LLM-readable text
    shape_count: int = 0
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class Agent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)  # matches YAML filename in scenarios/custom/
    display_name: str
    attribute_values: str  # JSON of AgentAttributes
    visual_thumbnail: str = ""  # data URL of canvas snapshot
    scenario_type: str  # system_design, behavioral, technical
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    last_used: Optional[datetime] = None
    forked_from: Optional[str] = None  # name of source template


class SkillDimension(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)  # normalized via .lower().strip()
    current_score: float = 0.0  # EMA-weighted score 0-10
    session_count: int = 0
    last_practiced: Optional[datetime] = None
    fsrs_card_json: str = ""  # serialized FSRS Card


class SkillObservation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    skill_dimension_id: int = Field(foreign_key="skilldimension.id")
    session_id: int = Field(foreign_key="session.id")
    score: float  # avg score for this dimension in this session
    fsrs_rating: int  # FSRS Rating enum value (1-4)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
