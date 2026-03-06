"""Phase-aware interview conductor with stateful session graph."""

from __future__ import annotations

import logging

from scenarios.loader import PhaseConfig

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are a professional interview coach conducting a mock interview. "
    "Ask one question at a time. Keep responses concise and conversational. "
    "After the candidate answers, provide brief feedback then ask the next question. "
    "You are speaking over audio. Do NOT use emojis, asterisks, or markdown formatting. "
    "Use plain, conversational text."
)


class InterviewConductor:
    """Phase-aware conversation manager replacing ConversationManager.

    When phases are provided, injects phase-specific context into the system
    prompt and tracks turn counts for phase transition decisions. When no
    phases are provided, behaves identically to the old ConversationManager.
    """

    def __init__(
        self,
        base_system_prompt: str = DEFAULT_SYSTEM_PROMPT,
        phases: list[PhaseConfig] | None = None,
    ):
        self.base_system_prompt = base_system_prompt
        self.phases: dict[str, PhaseConfig] = (
            {p.name: p for p in phases} if phases else {}
        )
        self.phase_order: list[str] = [p.name for p in phases] if phases else []
        self.messages: list[dict[str, str]] = []

        # Phase state
        self.current_phase: str | None = (
            self.phase_order[0] if self.phase_order else None
        )
        self.turn_count_in_phase: int = 0
        self.phase_history: list[dict] = []

        # Build initial system message
        self._rebuild_system_message()

    def _rebuild_system_message(self) -> None:
        """Reconstruct messages[0] with current phase injection."""
        prompt = self.base_system_prompt
        if self.current_phase and self.current_phase in self.phases:
            phase = self.phases[self.current_phase]
            prompt += (
                f"\n\n[CURRENT PHASE: {phase.display_name}]\n"
                f"{phase.prompt_injection}\n"
                f"[Phase objective: {phase.objective}]"
            )
        system_msg = {"role": "system", "content": prompt}
        if self.messages:
            self.messages[0] = system_msg
        else:
            self.messages.append(system_msg)

    def add_user_message(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})
        self.turn_count_in_phase += 1

    def add_assistant_message(self, text: str) -> None:
        self.messages.append({"role": "assistant", "content": text})

    def get_messages(self, max_context: int = 40) -> list[dict[str, str]]:
        """Return messages with context window management.

        Always includes system prompt + last N messages. When truncating,
        inserts a summary marker noting current phase and completed phases.
        """
        if len(self.messages) <= max_context + 1:
            return list(self.messages)

        system = self.messages[0]
        recent = self.messages[-max_context:]
        completed = [h["phase"] for h in self.phase_history]

        summary = {
            "role": "system",
            "content": (
                f"[Earlier conversation truncated. "
                f"Current phase: {self.current_phase or 'unknown'}. "
                f"Phases completed: {completed}]"
            ),
        }
        return [system, summary] + recent

    def advance_phase(self, next_phase: str) -> None:
        """Transition to a new phase."""
        if self.current_phase:
            self.phase_history.append({
                "phase": self.current_phase,
                "turns": self.turn_count_in_phase,
            })
            logger.info(
                "Phase '%s' completed after %d turns",
                self.current_phase,
                self.turn_count_in_phase,
            )
        self.current_phase = next_phase
        self.turn_count_in_phase = 0
        self._rebuild_system_message()

    def get_current_phase_config(self) -> PhaseConfig | None:
        if self.current_phase and self.current_phase in self.phases:
            return self.phases[self.current_phase]
        return None

    def should_evaluate_transition(self) -> bool:
        """Whether we should run the phase router after this turn."""
        if not self.current_phase or not self.phases:
            return False
        phase = self.phases[self.current_phase]
        if not phase.next_phases:
            return False
        if self.turn_count_in_phase < phase.min_turns:
            return False
        return True

    def must_transition(self) -> bool:
        """Whether max_turns forces a transition."""
        if not self.current_phase or not self.phases:
            return False
        phase = self.phases[self.current_phase]
        return (
            self.turn_count_in_phase >= phase.max_turns
            and bool(phase.next_phases)
        )

    def get_phase_history(self) -> list[dict]:
        """Return completed phase history for feedback/review."""
        history = list(self.phase_history)
        if self.current_phase:
            history.append({
                "phase": self.current_phase,
                "turns": self.turn_count_in_phase,
            })
        return history

    def reset(self) -> None:
        self.messages = []
        self.current_phase = (
            self.phase_order[0] if self.phase_order else None
        )
        self.turn_count_in_phase = 0
        self.phase_history = []
        self._rebuild_system_message()
