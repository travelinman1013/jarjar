"""Scan local directories for MLX-compatible models.

Discovers models with config.json + *.safetensors files, skipping GGUF-only dirs.
Supports both standard org/model layouts and HuggingFace cache layout.
"""

import glob
import logging
import os

logger = logging.getLogger(__name__)

_hf_cache_default = os.path.expanduser("~/.cache/huggingface/hub")
_env_dirs = os.environ.get("MLX_MODEL_DIRS", "")
MLX_MODEL_DIRS: list[str] = [
    d.strip() for d in _env_dirs.split(",") if d.strip()
] + [_hf_cache_default]


_LLM_ARCH_SUFFIXES = ("ForCausalLM", "ForConditionalGeneration")


def _is_mlx_model_dir(path: str) -> bool:
    """Check if a directory contains an MLX LLM (config.json + *.safetensors + causal arch)."""
    config_path = os.path.join(path, "config.json")
    if not os.path.isfile(config_path):
        return False
    if not glob.glob(os.path.join(path, "*.safetensors")):
        return False
    # Filter to LLM architectures only (skip embedding, vision, whisper models)
    try:
        import json
        with open(config_path) as f:
            config = json.load(f)
        archs = config.get("architectures", [])
        if not archs or not isinstance(archs, list):
            return False
        return any(a.endswith(_LLM_ARCH_SUFFIXES) for a in archs)
    except Exception:
        return False


def _scan_hf_cache(cache_dir: str) -> list[dict]:
    """Scan HuggingFace cache for MLX-compatible models."""
    models = []
    if not os.path.isdir(cache_dir):
        return models

    for entry in os.listdir(cache_dir):
        if not entry.startswith("models--"):
            continue

        # Parse: models--{org}--{name} → org/name
        # Use maxsplit=2 to handle model names containing double-dashes
        parts = entry.split("--", 2)
        if len(parts) != 3:
            continue

        org, name = parts[1], parts[2]
        hf_id = f"{org}/{name}"

        snapshots_dir = os.path.join(cache_dir, entry, "snapshots")
        if not os.path.isdir(snapshots_dir):
            continue

        # Check the most recent snapshot (usually only one)
        for snapshot in sorted(os.listdir(snapshots_dir), reverse=True):
            snapshot_path = os.path.join(snapshots_dir, snapshot)
            if _is_mlx_model_dir(snapshot_path):
                models.append({
                    "id": hf_id,
                    "label": hf_id,
                    "path": snapshot_path,
                    "source": "cache",
                })
                break  # Only take the first valid snapshot

    return models


def _scan_standard_dir(base_dir: str) -> list[dict]:
    """Scan for models at one or two levels deep.

    Handles both:
    - Two-level: base/org/model/config.json (e.g. LM Studio layout)
    - One-level: base/model/config.json (e.g. pointing directly at an org folder)
    """
    models = []
    if not os.path.isdir(base_dir):
        return models

    parent_name = os.path.basename(base_dir)

    for child in os.listdir(base_dir):
        child_path = os.path.join(base_dir, child)
        if not os.path.isdir(child_path):
            continue

        # Check if child itself is a model (one-level)
        if _is_mlx_model_dir(child_path):
            label = f"{parent_name}/{child}"
            models.append({
                "id": child_path,
                "label": label,
                "path": child_path,
                "source": "local",
            })
            continue

        # Otherwise check grandchildren (two-level: org/model)
        for model_name in os.listdir(child_path):
            model_path = os.path.join(child_path, model_name)
            if not os.path.isdir(model_path):
                continue

            if _is_mlx_model_dir(model_path):
                label = f"{child}/{model_name}"
                models.append({
                    "id": model_path,
                    "label": label,
                    "path": model_path,
                    "source": "local",
                })

    return models


def scan_local_models() -> list[dict]:
    """Scan all configured directories for MLX-compatible models.

    Returns deduplicated, sorted list of model dicts with keys:
    id, label, path, source ("local" or "cache").
    """
    all_models: list[dict] = []

    for directory in MLX_MODEL_DIRS:
        directory = os.path.expanduser(directory.strip())
        if not os.path.isdir(directory):
            continue

        try:
            # Detect HF cache by checking for models-- directories
            if any(
                e.startswith("models--")
                for e in os.listdir(directory)
                if os.path.isdir(os.path.join(directory, e))
            ):
                all_models.extend(_scan_hf_cache(directory))
            else:
                all_models.extend(_scan_standard_dir(directory))
        except Exception:
            logger.warning("Failed to scan model directory: %s", directory)

    # Deduplicate by label, keeping the first occurrence
    seen: set[str] = set()
    unique: list[dict] = []
    for m in all_models:
        if m["label"] not in seen:
            seen.add(m["label"])
            unique.append(m)

    unique.sort(key=lambda m: m["label"].lower())
    return unique
