"""YAML scenario parser.

Loads scenario templates from YAML files and validates
them against the ScenarioConfig schema.
"""

from pathlib import Path

import yaml
from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).parent / "templates"
CUSTOM_DIR = Path(__file__).parent / "custom"


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
    for dir_path in [TEMPLATES_DIR, CUSTOM_DIR]:
        if not dir_path.exists():
            continue
        for path in sorted(dir_path.glob("*.yaml")):
            with open(path) as f:
                data = yaml.safe_load(f)
            scenarios.append(ScenarioConfig(**data))
    return scenarios


def get_scenario_by_name(name: str) -> ScenarioConfig | None:
    for s in load_scenarios():
        if s.name == name:
            return s
    return None


def save_scenario(config: ScenarioConfig) -> None:
    """Save a scenario config to the custom directory as YAML."""
    CUSTOM_DIR.mkdir(parents=True, exist_ok=True)
    path = CUSTOM_DIR / f"{config.name}.yaml"
    with open(path, "w") as f:
        yaml.dump(config.model_dump(), f, default_flow_style=False, sort_keys=False)


def delete_scenario(name: str) -> bool:
    """Delete a custom scenario. Returns False if not found or is a template."""
    path = CUSTOM_DIR / f"{name}.yaml"
    if path.exists():
        path.unlink()
        return True
    return False


def is_custom_scenario(name: str) -> bool:
    return (CUSTOM_DIR / f"{name}.yaml").exists()
