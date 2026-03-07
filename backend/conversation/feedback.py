"""Post-session analysis and scoring.

Uses Pydantic AI for type-safe structured evaluation with rubric anchoring.
Supports per-phase multi-dimensional scoring when rubrics are available,
with fallback to legacy single-call evaluation.
"""

import asyncio
import json
import logging
import re
from collections import OrderedDict

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.providers.openai import OpenAIProvider

from openai import AsyncOpenAI

from storage.db import get_diagram_snapshot_for_phase
from . import llm as llm_module

logger = logging.getLogger(__name__)

FILLER_PATTERN = re.compile(
    r"\b(um|uh|like|you know|basically)\b", re.IGNORECASE
)

# Matches special tokens like <|channel|>, <|message|>, <|end|>
_SPECIAL_TOKEN_RE = re.compile(r"<\|[^|]*\|>")


class _SanitizingAsyncOpenAI(AsyncOpenAI):
    """AsyncOpenAI wrapper that strips special tokens from message content.

    Some models (e.g. gpt-oss-20b) output <|channel|> / <|message|> / <|end|>
    tokens. mlx_lm.server rejects requests containing these tokens in message
    content fields.  This wrapper sanitizes the body before each API call.
    """

    async def post(self, path, *, body=None, **kwargs):
        if isinstance(body, dict):
            for msg in body.get("messages", []):
                content = msg.get("content")
                if isinstance(content, str) and "<|" in content:
                    msg["content"] = _SPECIAL_TOKEN_RE.sub("", content)
        return await super().post(path, body=body, **kwargs)

# ── Pydantic AI model setup ─────────────────────────────────────────────────

_cached_model = None


def invalidate_caches():
    """Reset cached model (call when provider or model changes)."""
    global _cached_model
    _cached_model = None


async def _get_model():
    """Lazily resolve the Pydantic AI model based on LLM_PROVIDER."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model

    if llm_module.LLM_PROVIDER == "mlx":
        from .mlx_server import ensure_mlx_server
        base_url = await ensure_mlx_server()
        client = _SanitizingAsyncOpenAI(base_url=base_url, api_key="mlx")
        provider = OpenAIProvider(openai_client=client)
        # mlx_lm.server doesn't support tool calling — use prompted JSON output
        mlx_profile = ModelProfile(
            supports_tools=False,
            default_structured_output_mode='json',
        )
        _cached_model = OpenAIChatModel(
            llm_module.MLX_MODEL, provider=provider, profile=mlx_profile,
        )
    else:
        provider = OpenAIProvider(base_url=llm_module.LLM_BASE_URL, api_key=llm_module.LLM_API_KEY)
        _cached_model = OpenAIChatModel(llm_module.LLM_MODEL, provider=provider)

    return _cached_model


def _get_model_settings() -> dict:
    """Return model settings tuned for the active provider."""
    if llm_module.LLM_PROVIDER == "mlx":
        return {"temperature": 0.3, "max_tokens": 4096}
    return {}


def _log_agent_failure(label: str, exc: Exception) -> None:
    """Log detailed debug info when a Pydantic AI agent fails."""
    logger.error("%s failed: %s", label, exc)
    # UnexpectedModelBehavior has a body attr with the raw model output
    body = getattr(exc, "body", None)
    if body:
        logger.error("%s raw model output:\n%s", label, body[:2000])
    cause = exc.__cause__
    if cause:
        logger.error("%s validation error: %s", label, cause)


# ── Output models ───────────────────────────────────────────────────────────


class DimensionScore(BaseModel):
    """Score for a single rubric dimension within a phase."""
    dimension: str = Field(description="The focus area being evaluated")
    score: int = Field(ge=0, le=10, description="Score from 0-10")
    rubric_level: str = Field(description="Which rubric level best matches the candidate's performance")
    evidence_quote: str = Field(description="Direct quote from the transcript supporting this score")
    suggestion: str = Field(description="Specific advice for how to improve on this dimension")


class PhaseEvaluationResult(BaseModel):
    """Structured evaluation of a single interview phase."""
    dimensions: list[DimensionScore] = Field(description="Scores for each focus area evaluated in this phase")
    phase_summary: str = Field(description="One paragraph assessment of the candidate's performance in this phase")
    stronger_answer: str = Field(description="Example of what a stronger response would have included")


class LegacyFeedbackResult(BaseModel):
    """Legacy feedback format for backward compatibility."""
    overall_score: int = Field(ge=0, le=10, description="Holistic assessment of interview performance, 0-10")
    clarity_score: int = Field(ge=0, le=10, description="How clearly and concisely the candidate communicated, 0-10")
    structure_score: int = Field(ge=0, le=10, description="How well-organized and logical the responses were, 0-10")
    depth_score: int = Field(ge=0, le=10, description="How thoroughly the candidate explored topics with examples, 0-10")
    best_moment: str = Field(description="One sentence quoting or describing the candidate's strongest answer")
    biggest_opportunity: str = Field(description="One sentence of actionable improvement advice")
    technical_accuracy_notes: str = Field(default="", description="Any incorrect claims or missed key concepts, or empty string if N/A")


class SummaryResult(BaseModel):
    """Summary scores computed from per-phase evaluations."""
    overall_score: int = Field(ge=0, le=10, description="Holistic assessment of interview performance, 0-10")
    clarity_score: int = Field(ge=0, le=10, description="How clearly the candidate communicated, 0-10")
    structure_score: int = Field(ge=0, le=10, description="How well-organized the responses were, 0-10")
    depth_score: int = Field(ge=0, le=10, description="How thoroughly the candidate explored topics, 0-10")
    best_moment: str = Field(description="One sentence quoting or describing the candidate's strongest answer")
    biggest_opportunity: str = Field(description="One sentence of actionable improvement advice")
    technical_accuracy_notes: str = Field(default="", description="Incorrect claims or missed key concepts, or empty string if N/A")


# ── Agents ──────────────────────────────────────────────────────────────────

_phase_agent = Agent(
    output_type=PhaseEvaluationResult,
    output_retries=3,
    instructions=(
        "You are an expert interview coach evaluating a single phase of an interview. "
        "Score each dimension using the provided rubric anchors. "
        "Always cite a direct quote from the transcript as evidence. "
        "Be specific and constructive in suggestions. "
        "You MUST respond with valid JSON only, no markdown fencing or extra text."
    ),
)

_summary_agent = Agent(
    output_type=SummaryResult,
    output_retries=3,
    instructions=(
        "You are an expert interview coach providing a holistic summary "
        "of an interview session based on per-phase evaluation results. "
        "Synthesize the per-phase scores into overall clarity, structure, "
        "and depth scores. Identify the single best moment and biggest "
        "opportunity across the entire interview. "
        "You MUST respond with valid JSON only, no markdown fencing or extra text."
    ),
)

_legacy_agent = Agent(
    output_type=LegacyFeedbackResult,
    output_retries=3,
    instructions=(
        "You are an expert interview coach. Analyze the following interview "
        "transcript and provide structured feedback. "
        "Score descriptions: "
        "clarity_score: How clearly and concisely the candidate communicated. "
        "structure_score: How well-organized and logical the responses were. "
        "depth_score: How thoroughly the candidate explored topics with examples. "
        "overall_score: Holistic assessment of interview performance. "
        "You MUST respond with valid JSON only, no markdown fencing or extra text."
    ),
)


# ── Public API ──────────────────────────────────────────────────────────────


def count_filler_words(transcripts: list[dict]) -> int:
    """Count filler word occurrences in user transcript entries."""
    count = 0
    for t in transcripts:
        if t["speaker"] == "user":
            count += len(FILLER_PATTERN.findall(t["text"]))
    return count


def _segment_by_phase(transcripts: list[dict]) -> OrderedDict[str, list[dict]]:
    """Group transcripts by phase, preserving order."""
    segments: OrderedDict[str, list[dict]] = OrderedDict()
    for t in transcripts:
        phase = t.get("phase") or "unknown"
        if phase not in segments:
            segments[phase] = []
        segments[phase].append(t)
    return segments


def _format_transcript(transcripts: list[dict]) -> str:
    return "\n".join(
        f"[{t['speaker'].upper()}]: {t['text']}" for t in transcripts
    )


def _build_rubric_prompt(
    focus_areas: list[str],
    rubrics: dict[str, dict[str, str]],
) -> str:
    """Build rubric anchor text for the LLM prompt."""
    lines = ["Rubric scoring anchors (use these to calibrate your scores):"]
    for area in focus_areas:
        levels = rubrics.get(area, {})
        if levels:
            lines.append(f"\n{area}:")
            for level in ["3", "5", "7", "9"]:
                if level in levels:
                    lines.append(f"  Score ~{level}: {levels[level]}")
    return "\n".join(lines)


async def generate_rubric_feedback(
    session_id: int,
    transcripts: list[dict],
    scenario_name: str,
    focus_areas: list[str],
    evaluation_criteria: list[str],
    rubrics: dict[str, dict[str, str]],
    phase_exemplars: dict[str, dict[str, str]],
    phases_config: list | None = None,
    retriever=None,
    knowledge_collections: list[str] | None = None,
) -> dict:
    """Multi-pass rubric-grounded evaluation with Pydantic AI.

    Returns dict with 'summary' (legacy fields), 'phase_scores' (per-phase),
    and 'dimensions' (list of focus area names).
    """
    segments = _segment_by_phase(transcripts)
    logger.info(
        "Rubric feedback for session %d: %d phases (%s)",
        session_id, len(segments), ", ".join(segments.keys()),
    )
    rubric_text = _build_rubric_prompt(focus_areas, rubrics)

    # Build phase display name lookup
    phase_display = {}
    if phases_config:
        for p in phases_config:
            name = p.name if hasattr(p, "name") else p.get("name", "")
            display = p.display_name if hasattr(p, "display_name") else p.get("display_name", name)
            phase_display[name] = display

    phase_scores = []
    all_dimension_scores = []

    for order, (phase_name, phase_transcripts) in enumerate(segments.items()):
        # Skip trivial phases (opening/wrap_up with minimal content)
        user_turns = [t for t in phase_transcripts if t["speaker"] == "user"]
        if not user_turns:
            continue

        transcript_text = _format_transcript(phase_transcripts)

        # Build per-phase prompt
        exemplar = phase_exemplars.get(phase_name, {})
        exemplar_hint = exemplar.get("strong_answer_hint", "")

        prompt_parts = [
            f"Scenario: {scenario_name}",
            f"Phase: {phase_display.get(phase_name, phase_name)}",
            f"Focus areas to evaluate: {', '.join(focus_areas)}",
            f"\n{rubric_text}",
        ]

        if exemplar_hint:
            prompt_parts.append(f"\nStrong answer reference: {exemplar_hint}")

        # RAG retrieval for this phase
        if retriever and knowledge_collections:
            try:
                user_text = " ".join(t["text"] for t in user_turns)
                chunks = await retriever.retrieve(
                    query=user_text[:500],
                    collections=knowledge_collections,
                    top_k=3,
                )
                if chunks:
                    prompt_parts.append(
                        "\nReference material for evaluating technical accuracy:\n"
                        + retriever.format_context(chunks)
                    )
            except Exception:
                logger.warning("RAG retrieval failed for phase %s", phase_name)

        # Diagram context injection
        diagram = await asyncio.to_thread(
            get_diagram_snapshot_for_phase, session_id, phase_name
        )
        if diagram and diagram["serialized_text"] and diagram["shape_count"] > 0:
            prompt_parts.append(
                f"\nCandidate's diagram at end of this phase:\n"
                f"{diagram['serialized_text']}\n"
                f"Consider the diagram quality when scoring architecture and design dimensions."
            )

        prompt_parts.append(f"\nTranscript for this phase:\n{transcript_text}")

        prompt = "\n".join(prompt_parts)

        logger.info("Evaluating phase '%s' (%d user turns, %d chars prompt)...",
                     phase_name, len(user_turns), len(prompt))
        try:
            model = await _get_model()
            settings = _get_model_settings()
            logger.debug("Phase agent model=%s, settings=%s", model, settings)
            result = await _phase_agent.run(
                prompt, model=model, model_settings=settings,
            )
            evaluation = result.output

            phase_score_data = {
                "phase_name": phase_name,
                "phase_display_name": phase_display.get(phase_name, phase_name),
                "phase_order": order,
                "dimension_scores": [d.model_dump() for d in evaluation.dimensions],
                "phase_summary": evaluation.phase_summary,
                "stronger_answer": evaluation.stronger_answer,
            }
            phase_scores.append(phase_score_data)
            all_dimension_scores.extend(evaluation.dimensions)
            logger.info("Phase '%s' evaluated: %d dimensions, scores=%s",
                        phase_name, len(evaluation.dimensions),
                        [d.score for d in evaluation.dimensions])

        except Exception as exc:
            _log_agent_failure(f"Phase evaluation [{phase_name}]", exc)
            continue

    # Generate summary from per-phase results
    logger.info("Generating summary from %d phase scores...", len(phase_scores))
    summary = await _generate_summary(
        transcripts, scenario_name, phase_scores, all_dimension_scores, focus_areas,
    )
    logger.info("Summary complete: overall=%s", summary.get("overall_score"))

    return {
        "summary": summary,
        "phase_scores": phase_scores,
        "dimensions": focus_areas,
    }


async def _generate_summary(
    transcripts: list[dict],
    scenario_name: str,
    phase_scores: list[dict],
    all_dimensions: list[DimensionScore],
    focus_areas: list[str],
) -> dict:
    """Generate holistic summary from per-phase evaluations."""
    if not phase_scores:
        # No phases evaluated — return defaults
        return _default_summary()

    # Build summary prompt with per-phase results
    phase_summaries = []
    for ps in phase_scores:
        dims = ", ".join(
            f"{d['dimension']}={d['score']}" for d in ps["dimension_scores"]
        )
        phase_summaries.append(
            f"- {ps['phase_display_name']}: {dims}. {ps['phase_summary']}"
        )

    # Condense transcript for context
    transcript_text = _format_transcript(transcripts)
    max_chars = 3000
    if len(transcript_text) > max_chars:
        transcript_text = transcript_text[:max_chars] + "\n[... transcript truncated ...]"

    prompt = (
        f"Scenario: {scenario_name}\n\n"
        f"Per-phase evaluation results:\n"
        + "\n".join(phase_summaries)
        + f"\n\nFull transcript (condensed):\n{transcript_text}"
    )

    try:
        result = await _summary_agent.run(
            prompt, model=await _get_model(), model_settings=_get_model_settings(),
        )
        return result.output.model_dump()
    except Exception as exc:
        _log_agent_failure("Summary generation", exc)
        return _compute_fallback_summary(all_dimensions)


def _compute_fallback_summary(dimensions: list[DimensionScore]) -> dict:
    """Compute summary scores as averages when LLM summary fails."""
    if not dimensions:
        return _default_summary()

    avg = sum(d.score for d in dimensions) / len(dimensions)
    return {
        "overall_score": round(avg),
        "clarity_score": round(avg),
        "structure_score": round(avg),
        "depth_score": round(avg),
        "best_moment": "See per-phase evaluations for details.",
        "biggest_opportunity": "See per-phase evaluations for details.",
        "technical_accuracy_notes": "",
    }


def _default_summary() -> dict:
    return {
        "overall_score": 5,
        "clarity_score": 5,
        "structure_score": 5,
        "depth_score": 5,
        "best_moment": "Unable to generate detailed feedback.",
        "biggest_opportunity": "Try again with a longer interview session.",
        "technical_accuracy_notes": "",
    }


async def generate_feedback_legacy(
    session_id: int,
    transcripts: list[dict],
    scenario_name: str,
    evaluation_criteria: list[str],
    retriever=None,
    knowledge_collections: list[str] | None = None,
) -> dict:
    """Legacy single-call feedback using Pydantic AI (for scenarios without rubrics)."""
    transcript_text = _format_transcript(transcripts)

    prompt_parts = [
        f"Scenario: {scenario_name}",
        f"Evaluation criteria: {', '.join(evaluation_criteria)}",
        f"\nTranscript:\n{transcript_text}",
    ]

    # RAG grounding
    if retriever and knowledge_collections:
        try:
            user_text = " ".join(
                t["text"] for t in transcripts if t["speaker"] == "user"
            )
            chunks = await retriever.retrieve(
                query=user_text[:500],
                collections=knowledge_collections,
                top_k=5,
            )
            if chunks:
                prompt_parts.append(
                    "\nWhen evaluating technical accuracy, cross-reference the "
                    "candidate's claims against the following reference material. "
                    "Note any incorrect claims or missed key concepts in "
                    "technical_accuracy_notes.\n\n"
                    + retriever.format_context(chunks)
                )
        except Exception:
            pass

    prompt = "\n".join(prompt_parts)

    try:
        result = await _legacy_agent.run(
            prompt, model=await _get_model(), model_settings=_get_model_settings(),
        )
        return result.output.model_dump()
    except Exception as exc:
        _log_agent_failure("Legacy feedback generation", exc)
        return _default_summary()
