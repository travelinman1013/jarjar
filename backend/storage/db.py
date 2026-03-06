"""SQLite connection and CRUD helpers.

All functions are synchronous — call via asyncio.to_thread() from async context.
"""

import json

from sqlalchemy import text
from sqlmodel import Session as DBSession, SQLModel, create_engine, select

from .models import (
    PhaseScore,
    Score,
    Session,
    SkillDimension,
    SkillObservation,
    TranscriptEntry,
)

DATABASE_URL = "sqlite:///sessions.db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def _run_migrations() -> None:
    """Apply additive schema migrations for existing databases."""
    with engine.connect() as conn:
        # Add 'phase' column to transcriptentry if missing
        result = conn.execute(text("PRAGMA table_info(transcriptentry)"))
        columns = [row[1] for row in result]
        if "phase" not in columns:
            conn.execute(
                text("ALTER TABLE transcriptentry ADD COLUMN phase TEXT")
            )
            conn.commit()

        # Add new columns to score table if missing
        result = conn.execute(text("PRAGMA table_info(score)"))
        columns = [row[1] for row in result]
        for col in ["technical_accuracy_notes", "dimension_names"]:
            if col not in columns:
                conn.execute(
                    text(f"ALTER TABLE score ADD COLUMN {col} TEXT DEFAULT ''")
                )
                conn.commit()


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
    phase: str | None = None,
) -> TranscriptEntry:
    with DBSession(engine) as db:
        entry = TranscriptEntry(
            session_id=session_id,
            turn_id=turn_id,
            speaker=speaker,
            text=text,
            timestamp=timestamp,
            phase=phase,
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
    technical_accuracy_notes: str = "",
    dimension_names: str = "",
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
            technical_accuracy_notes=technical_accuracy_notes,
            dimension_names=dimension_names,
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
        result = {
            "overall_score": score.overall_score,
            "clarity_score": score.clarity_score,
            "structure_score": score.structure_score,
            "depth_score": score.depth_score,
            "best_moment": score.best_moment,
            "biggest_opportunity": score.biggest_opportunity,
            "filler_word_count": score.filler_word_count,
            "technical_accuracy_notes": score.technical_accuracy_notes or "",
        }
        if score.dimension_names:
            result["dimension_names"] = json.loads(score.dimension_names)
        return result


def save_phase_scores(
    session_id: int, phase_scores: list[dict]
) -> list[PhaseScore]:
    with DBSession(engine) as db:
        rows = []
        for ps in phase_scores:
            row = PhaseScore(
                session_id=session_id,
                phase_name=ps["phase_name"],
                phase_display_name=ps["phase_display_name"],
                phase_order=ps["phase_order"],
                dimension_scores=json.dumps(ps["dimension_scores"]),
                phase_summary=ps.get("phase_summary", ""),
                stronger_answer=ps.get("stronger_answer", ""),
            )
            db.add(row)
            rows.append(row)
        db.commit()
        for r in rows:
            db.refresh(r)
        return rows


def get_phase_scores_by_session_id(session_id: int) -> list[dict]:
    with DBSession(engine) as db:
        rows = db.exec(
            select(PhaseScore)
            .where(PhaseScore.session_id == session_id)
            .order_by(PhaseScore.phase_order)
        ).all()
        return [
            {
                "phase_name": r.phase_name,
                "phase_display_name": r.phase_display_name,
                "phase_order": r.phase_order,
                "dimension_scores": json.loads(r.dimension_scores),
                "phase_summary": r.phase_summary,
                "stronger_answer": r.stronger_answer,
            }
            for r in rows
        ]


def upsert_skill_dimension(
    name: str,
    current_score: float,
    session_count: int,
    last_practiced,
    fsrs_card_json: str,
) -> SkillDimension:
    with DBSession(engine) as db:
        existing = db.exec(
            select(SkillDimension).where(SkillDimension.name == name)
        ).first()
        if existing:
            existing.current_score = current_score
            existing.session_count = session_count
            existing.last_practiced = last_practiced
            existing.fsrs_card_json = fsrs_card_json
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing
        dim = SkillDimension(
            name=name,
            current_score=current_score,
            session_count=session_count,
            last_practiced=last_practiced,
            fsrs_card_json=fsrs_card_json,
        )
        db.add(dim)
        db.commit()
        db.refresh(dim)
        return dim


def get_all_skill_dimensions() -> list[SkillDimension]:
    with DBSession(engine) as db:
        return list(db.exec(select(SkillDimension)).all())


def get_skill_dimension_by_name(name: str) -> SkillDimension | None:
    with DBSession(engine) as db:
        return db.exec(
            select(SkillDimension).where(SkillDimension.name == name)
        ).first()


def get_skill_observations_by_session(session_id: int) -> list[SkillObservation]:
    with DBSession(engine) as db:
        return list(db.exec(
            select(SkillObservation).where(
                SkillObservation.session_id == session_id
            )
        ).all())


def create_skill_observation(
    skill_dimension_id: int,
    session_id: int,
    score: float,
    fsrs_rating: int,
) -> SkillObservation:
    with DBSession(engine) as db:
        obs = SkillObservation(
            skill_dimension_id=skill_dimension_id,
            session_id=session_id,
            score=score,
            fsrs_rating=fsrs_rating,
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)
        return obs


def update_skill_observation(
    observation_id: int,
    score: float,
    fsrs_rating: int,
) -> None:
    with DBSession(engine) as db:
        obs = db.get(SkillObservation, observation_id)
        if obs:
            obs.score = score
            obs.fsrs_rating = fsrs_rating
            db.add(obs)
            db.commit()


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
                    "phase": e.phase,
                }
                for e in entries
            ],
        }
