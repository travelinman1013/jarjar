"""Lightweight phase transition router.

Runs a small LLM call AFTER the bot finishes speaking to decide
whether the interview should advance to the next phase. Off the
hot path — zero impact on perceived latency.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from openai import AsyncOpenAI

from conversation.llm import client, LLM_MODEL, LLM_PROVIDER, MLX_MODEL

logger = logging.getLogger(__name__)

_cached_client: AsyncOpenAI | None = None


def invalidate_caches():
    """Reset cached client (call when provider or model changes)."""
    global _cached_client
    _cached_client = None


async def _get_client() -> AsyncOpenAI:
    """Resolve the OpenAI client based on LLM_PROVIDER."""
    global _cached_client
    if _cached_client is not None:
        return _cached_client

    if LLM_PROVIDER == "mlx":
        from conversation.mlx_server import ensure_mlx_server
        base_url = await ensure_mlx_server()
        _cached_client = AsyncOpenAI(base_url=base_url, api_key="mlx")
    else:
        _cached_client = client

    return _cached_client


def _get_model_name() -> str:
    return MLX_MODEL if LLM_PROVIDER == "mlx" else LLM_MODEL


class PhaseDecision(BaseModel):
    should_advance: bool
    next_phase: str | None = None
    reasoning: str = ""


ROUTER_SYSTEM_PROMPT = (
    "You are an interview phase transition evaluator. "
    "Based on the recent conversation, decide if the interview should "
    "advance to the next phase.\n\n"
    "You MUST respond with raw, parseable JSON only. "
    "Do NOT wrap your response in markdown code blocks, backticks, or any formatting. "
    "Output ONLY a JSON object with these fields:\n"
    '- "should_advance": true or false\n'
    '- "next_phase": the name of the next phase (string) or null\n'
    '- "reasoning": a brief explanation (string)\n'
)


async def evaluate_phase_transition(conductor) -> PhaseDecision:
    """Decide whether to advance the interview phase.

    Uses a minimal context window (last 4 messages + phase config)
    for speed. Returns PhaseDecision with stay/advance recommendation.
    """
    from conversation.phases import InterviewConductor

    conductor: InterviewConductor

    phase = conductor.get_current_phase_config()
    if not phase:
        return PhaseDecision(should_advance=False, reasoning="No phases configured")

    # Hard ceiling: force advance at max_turns
    if conductor.must_transition():
        next_phase = phase.next_phases[0]
        logger.info(
            "Force advancing from '%s' (max_turns=%d reached) -> '%s'",
            phase.name, phase.max_turns, next_phase,
        )
        return PhaseDecision(
            should_advance=True,
            next_phase=next_phase,
            reasoning=f"Max turns ({phase.max_turns}) reached",
        )

    # Build minimal context for the router
    recent = [
        m for m in conductor.messages[-4:]
        if m["role"] != "system"
    ]
    conversation_snippet = "\n".join(
        f"[{m['role'].upper()}]: {m['content'][:200]}"
        for m in recent
    )

    system_content = (
        f"{ROUTER_SYSTEM_PROMPT}"
        f"Current phase: {phase.display_name}\n"
        f"Phase objective: {phase.objective}\n"
        f"Transition hint: {phase.transition_hint}\n"
        f"Turns in this phase: {conductor.turn_count_in_phase}\n"
        f"Valid next phases: {', '.join(phase.next_phases)}\n"
    )

    router_messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": conversation_snippet},
    ]

    try:
        active_client = await _get_client()
        response = await active_client.chat.completions.create(
            model=_get_model_name(),
            messages=router_messages,
            temperature=0.1,
            max_tokens=128,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        # Strip markdown code fences in case the model wraps anyway
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()

        decision = PhaseDecision.model_validate(json.loads(content))

        # Validate that next_phase is actually a valid successor
        if decision.should_advance and decision.next_phase:
            if decision.next_phase not in phase.next_phases:
                logger.warning(
                    "Router suggested invalid phase '%s', valid: %s. Defaulting to first.",
                    decision.next_phase, phase.next_phases,
                )
                decision.next_phase = phase.next_phases[0]

        logger.info(
            "Phase router: advance=%s, next=%s, reason='%s'",
            decision.should_advance, decision.next_phase, decision.reasoning,
        )
        return decision

    except Exception:
        logger.exception("Phase router failed, staying in current phase")
        return PhaseDecision(
            should_advance=False,
            reasoning="Router evaluation failed",
        )
