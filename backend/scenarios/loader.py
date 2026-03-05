"""YAML scenario parser.

Loads scenario templates from YAML files and validates
them against the ScenarioConfig schema.
"""

from pathlib import Path

import yaml
from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).parent / "templates"


class ScenarioConfig(BaseModel):
    name: str
    type: str
    difficulty: str
    duration_minutes: int
    system_prompt: str
    focus_areas: list[str]
    evaluation_criteria: list[str]


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
