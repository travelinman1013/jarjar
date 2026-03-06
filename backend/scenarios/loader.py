"""YAML scenario parser.

Loads scenario templates from YAML files and validates
them against the ScenarioConfig schema.
"""

from pathlib import Path

import yaml
from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).parent / "templates"


class PhaseConfig(BaseModel):
    name: str
    display_name: str
    objective: str
    prompt_injection: str
    max_turns: int = 6
    min_turns: int = 1
    transition_hint: str = ""
    next_phases: list[str] = []


class ScenarioConfig(BaseModel):
    name: str
    type: str
    difficulty: str
    duration_minutes: int
    system_prompt: str
    focus_areas: list[str]
    evaluation_criteria: list[str]
    phases: list[PhaseConfig] = []
    knowledge_collections: list[str] = []
    rubrics: dict[str, dict[str, str]] = {}  # focus_area -> {"3": desc, "5": desc, ...}
    phase_exemplars: dict[str, dict[str, str]] = {}  # phase_name -> {"strong_answer_hint": ...}
    whiteboard_enabled: bool = False


def load_scenarios() -> list[ScenarioConfig]:
    scenarios = []
    if not TEMPLATES_DIR.exists():
        return scenarios
    for path in sorted(TEMPLATES_DIR.glob("*.yaml")):
        with open(path) as f:
            data = yaml.safe_load(f)
        scenarios.append(ScenarioConfig(**data))
    return scenarios


def get_scenario_by_name(name: str) -> ScenarioConfig | None:
    for s in load_scenarios():
        if s.name == name:
            return s
    return None
