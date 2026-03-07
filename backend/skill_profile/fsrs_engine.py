"""FSRS spaced repetition engine for skill dimension tracking."""

import json
from datetime import datetime, timezone

from fsrs import Card, Rating, Scheduler

# Desired retention slightly below default (0.9) since interview skills
# decay faster than flashcard knowledge.
_scheduler = Scheduler(desired_retention=0.85, enable_fuzzing=False)


def score_to_rating(score: float) -> Rating:
    """Map a 0-10 rubric score to an FSRS Rating."""
    if score <= 3:
        return Rating.Again
    if score <= 5:
        return Rating.Hard
    if score <= 7:
        return Rating.Good
    return Rating.Easy


def review_skill(
    card_json: str | None, score: float
) -> tuple[str, float, datetime]:
    """Advance an FSRS card with a new review.

    Args:
        card_json: JSON-serialized Card dict, or None/empty for first review.
        score: Rubric score 0-10.

    Returns:
        (updated_card_json, retrievability, next_review_date)
    """
    if card_json:
        card = Card.from_dict(json.loads(card_json))
    else:
        card = Card()

    rating = score_to_rating(score)
    updated_card, _log = _scheduler.review_card(card, rating)

    retrievability = _scheduler.get_card_retrievability(updated_card)
    updated_json = json.dumps(updated_card.to_dict(), default=str)

    return updated_json, retrievability, updated_card.due


def compute_retrievability(card_json: str) -> float:
    """Compute current recall probability for a serialized card."""
    if not card_json:
        return 0.0
    card = Card.from_dict(json.loads(card_json))
    return _scheduler.get_card_retrievability(card)
