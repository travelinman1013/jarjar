"""SQLite connection and CRUD helpers.

All functions are synchronous — call via asyncio.to_thread() from async context.
"""

from sqlmodel import Session as DBSession, SQLModel, create_engine, select

from .models import Score, Session, TranscriptEntry

DATABASE_URL = "sqlite:///sessions.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def create_session(scenario_name: str) -> Session:
    with DBSession(engine) as db:
        session = Session(scenario_name=scenario_name)
        db.add(session)
        db.commit()
        db.refresh(session)
        return session


def add_transcript_entry(
    session_id: int,
    turn_id: int,
    speaker: str,
    text: str,
    timestamp: float,
) -> TranscriptEntry:
    with DBSession(engine) as db:
        entry = TranscriptEntry(
            session_id=session_id,
            turn_id=turn_id,
            speaker=speaker,
            text=text,
            timestamp=timestamp,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry


def update_session_duration(session_id: int, duration: float) -> None:
    with DBSession(engine) as db:
        session = db.get(Session, session_id)
        if session:
            session.duration_seconds = duration
            db.add(session)
            db.commit()


def get_session_scenario(session_id: int) -> str | None:
    """Return just the scenario_name string, avoiding detached ORM objects."""
    with DBSession(engine) as db:
        session = db.get(Session, session_id)
        return session.scenario_name if session else None


def save_score(
    session_id: int,
    overall_score: int,
    clarity_score: int,
    structure_score: int,
    depth_score: int,
    best_moment: str,
    biggest_opportunity: str,
    filler_word_count: int,
) -> Score:
    with DBSession(engine) as db:
        score = Score(
            session_id=session_id,
            overall_score=overall_score,
            clarity_score=clarity_score,
            structure_score=structure_score,
            depth_score=depth_score,
            best_moment=best_moment,
            biggest_opportunity=biggest_opportunity,
            filler_word_count=filler_word_count,
        )
        db.add(score)
        db.commit()
        db.refresh(score)
        return score


def get_score_by_session_id(session_id: int) -> dict | None:
    with DBSession(engine) as db:
        score = db.exec(
            select(Score).where(Score.session_id == session_id)
        ).first()
        if not score:
            return None
        return {
            "overall_score": score.overall_score,
            "clarity_score": score.clarity_score,
            "structure_score": score.structure_score,
            "depth_score": score.depth_score,
            "best_moment": score.best_moment,
            "biggest_opportunity": score.biggest_opportunity,
            "filler_word_count": score.filler_word_count,
        }


def get_session_with_transcripts(session_id: int) -> dict | None:
    with DBSession(engine) as db:
        session = db.get(Session, session_id)
        if not session:
            return None
        entries = db.exec(
            select(TranscriptEntry)
            .where(TranscriptEntry.session_id == session_id)
            .order_by(TranscriptEntry.id)
        ).all()
        return {
            "id": session.id,
            "scenario_name": session.scenario_name,
            "created_at": session.created_at.isoformat(),
            "duration_seconds": session.duration_seconds,
            "transcripts": [
                {
                    "turn_id": e.turn_id,
                    "speaker": e.speaker,
                    "text": e.text,
                    "timestamp": e.timestamp,
                }
                for e in entries
            ],
        }
