"""Candidate skill profile management with FSRS spaced repetition."""

import json
import logging
from datetime import datetime, timezone

from skill_profile.fsrs_engine import compute_retrievability, review_skill, score_to_rating
from scenarios.loader import ScenarioConfig, load_scenarios
from storage.db import (
    create_skill_observation,
    delete_skill_dimension,
    get_all_skill_dimensions,
    get_observations_for_dimension,
    get_phase_scores_by_session_id,
    get_skill_dimension_by_id,
    get_skill_dimension_by_name,
    get_skill_observations_by_session,
    reset_all_skill_data,
    reset_skill_dimensions,
    update_skill_observation,
    upsert_skill_dimension,
)

logger = logging.getLogger(__name__)

# EMA alpha — 0.4 means ~87% of weight from the 3 most recent sessions
EMA_ALPHA = 0.4


def normalize_dimension_name(name: str) -> str:
    """Normalize dimension names to prevent duplicates from casing/spacing."""
    return name.lower().strip()


def _ema_score(old_score: float, new_score: float, count: int) -> float:
    """Compute exponential moving average score.

    For the first observation, just return the new score.
    """
    if count <= 1:
        return new_score
    return EMA_ALPHA * new_score + (1 - EMA_ALPHA) * old_score


def update_profile_from_session(session_id: int) -> None:
    """Update skill profile from a session's phase scores.

    Idempotent: if observations already exist for this session, updates scores
    but does NOT re-advance FSRS cards to prevent interval corruption.
    """
    phase_scores = get_phase_scores_by_session_id(session_id)
    if not phase_scores:
        return

    # Aggregate dimension scores across all phases
    dim_scores: dict[str, list[float]] = {}
    for ps in phase_scores:
        for ds in ps["dimension_scores"]:
            name = normalize_dimension_name(ds["dimension"])
            dim_scores.setdefault(name, []).append(ds["score"])

    if not dim_scores:
        return

    # Check idempotency: do observations already exist for this session?
    existing_obs = get_skill_observations_by_session(session_id)
    is_reanalysis = len(existing_obs) > 0
    existing_obs_by_dim: dict[int, object] = {}
    if is_reanalysis:
        existing_obs_by_dim = {obs.skill_dimension_id: obs for obs in existing_obs}

    now = datetime.now(timezone.utc)

    for dim_name, scores in dim_scores.items():
        avg_score = sum(scores) / len(scores)
        rating = score_to_rating(avg_score)
        existing_dim = get_skill_dimension_by_name(dim_name)

        if is_reanalysis and existing_dim and existing_dim.id in existing_obs_by_dim:
            # Re-analysis: update observation score but skip FSRS advancement
            obs = existing_obs_by_dim[existing_dim.id]
            update_skill_observation(obs.id, avg_score, rating.value)

            # Recalculate EMA with updated score (same session_count)
            new_ema = _ema_score(
                existing_dim.current_score, avg_score, existing_dim.session_count
            )
            upsert_skill_dimension(
                name=dim_name,
                current_score=new_ema,
                session_count=existing_dim.session_count,
                last_practiced=existing_dim.last_practiced,
                fsrs_card_json=existing_dim.fsrs_card_json,
            )
            logger.info(
                "Re-analysis: updated observation for %s (score=%.1f), "
                "skipped FSRS advancement",
                dim_name, avg_score,
            )
        else:
            # New session: advance FSRS card and create observation
            old_score = existing_dim.current_score if existing_dim else 0.0
            old_count = existing_dim.session_count if existing_dim else 0
            old_card_json = existing_dim.fsrs_card_json if existing_dim else ""

            new_count = old_count + 1
            new_ema = _ema_score(old_score, avg_score, new_count)
            card_json, _retrievability, _due = review_skill(
                old_card_json, avg_score
            )

            dim = upsert_skill_dimension(
                name=dim_name,
                current_score=new_ema,
                session_count=new_count,
                last_practiced=now,
                fsrs_card_json=card_json,
            )
            create_skill_observation(
                skill_dimension_id=dim.id,
                session_id=session_id,
                score=avg_score,
                fsrs_rating=rating.value,
            )
            logger.info(
                "Profile updated: %s score=%.1f -> %.1f (EMA), count=%d",
                dim_name, avg_score, new_ema, new_count,
            )


def recalculate_dimensions(dimension_ids: list[int]) -> None:
    """Recalculate EMA + FSRS for dimensions from remaining observations.

    Deletes dimension if no observations remain.
    """
    for dim_id in dimension_ids:
        observations = get_observations_for_dimension(dim_id)
        if not observations:
            delete_skill_dimension(dim_id)
            continue
        dim = get_skill_dimension_by_id(dim_id)
        if not dim:
            continue
        # Replay EMA chronologically
        score = 0.0
        for i, obs in enumerate(observations):
            score = _ema_score(score, obs.score, i + 1)
        # Replay FSRS from fresh card
        card_json = ""
        for obs in observations:
            card_json, _, _ = review_skill(card_json, obs.score)
        last_obs = observations[-1]
        upsert_skill_dimension(
            name=dim.name,
            current_score=score,
            session_count=len(observations),
            last_practiced=last_obs.created_at,
            fsrs_card_json=card_json,
        )


def reset_profile() -> int:
    """Full profile reset. Returns dimensions cleared count."""
    return reset_all_skill_data()


def reset_dimensions(names: list[str]) -> list[str]:
    """Selective dimension reset. Returns names actually cleared."""
    normalized = [normalize_dimension_name(n) for n in names]
    return reset_skill_dimensions(normalized)


def get_profile() -> dict:
    """Return full skill profile with current retrievability."""
    dimensions = get_all_skill_dimensions()
    return {
        "dimensions": [
            {
                "name": d.name,
                "current_score": round(d.current_score, 1),
                "session_count": d.session_count,
                "last_practiced": d.last_practiced.isoformat()
                if d.last_practiced
                else None,
                "retrievability": round(
                    compute_retrievability(d.fsrs_card_json), 2
                ),
            }
            for d in dimensions
        ]
    }


def get_recommendations() -> list[dict]:
    """Recommend scenarios based on weak/due skill dimensions."""
    profile = get_profile()
    dim_map = {d["name"]: d for d in profile["dimensions"]}
    scenarios = load_scenarios()

    results = []
    for scenario in scenarios:
        normalized_areas = [
            normalize_dimension_name(fa) for fa in scenario.focus_areas
        ]
        urgency = 0.0
        weak_dims = []
        due_dims = []

        for fa in normalized_areas:
            if fa in dim_map:
                d = dim_map[fa]
                ret = d["retrievability"]
                score = d["current_score"]
                # Urgency from low retrievability (due for review)
                urgency += (1 - ret) * 0.6
                # Urgency from low score (weak area)
                urgency += (1 - score / 10) * 0.4
                if score < 6:
                    weak_dims.append(fa)
                if ret < 0.7:
                    due_dims.append(fa)
            else:
                # Never practiced — maximally urgent
                urgency += 1.0
                weak_dims.append(fa)

        if len(normalized_areas) > 0:
            urgency /= len(normalized_areas)

        results.append(
            {
                "scenario_name": scenario.name,
                "urgency": round(urgency, 2),
                "weak_dimensions": weak_dims,
                "due_dimensions": due_dims,
            }
        )

    results.sort(key=lambda r: r["urgency"], reverse=True)
    return results
