"""Serialize tldraw canvas snapshots into concise text for LLM context injection."""

from __future__ import annotations

import logging
import math

logger = logging.getLogger(__name__)

EMPTY_DIAGRAM = (
    "[CANDIDATE'S DIAGRAM]\n"
    "The candidate's whiteboard is currently empty.\n"
    "[END DIAGRAM]"
)

FALLBACK_DIAGRAM = (
    "[CANDIDATE'S DIAGRAM]\n"
    "(Diagram could not be parsed)\n"
    "[END DIAGRAM]"
)

# Max approximate token budget for diagram text
MAX_COMPONENTS = 20


def serialize_tldraw_snapshot(snapshot: dict) -> str:
    """Convert a tldraw store snapshot to a text description for LLM context.

    Args:
        snapshot: The tldraw store snapshot dict (from editor.store.getSnapshot()).
                  Expected to have a "store" key with record entries.

    Returns:
        A formatted text block wrapped in [CANDIDATE'S DIAGRAM] markers.
    """
    try:
        return _serialize(snapshot)
    except Exception:
        logger.warning("Failed to serialize tldraw snapshot", exc_info=True)
        return FALLBACK_DIAGRAM


def _serialize(snapshot: dict) -> str:
    store = snapshot.get("store", snapshot)

    # Extract shapes from the store records
    shapes = {}
    for key, record in store.items():
        if isinstance(record, dict) and record.get("typeName") == "shape":
            shapes[record["id"]] = record

    if not shapes:
        return EMPTY_DIAGRAM

    # Classify shapes
    components = []  # (id, label, geo_type, x, y)
    arrows = []  # (start_id, end_id, label)
    annotations = []  # (text, x, y)

    for shape_id, shape in shapes.items():
        shape_type = shape.get("type", "")
        props = shape.get("props", {})
        x = shape.get("x", 0)
        y = shape.get("y", 0)

        if shape_type in ("geo", "note", "frame"):
            label = (props.get("text") or props.get("name") or "").strip()
            geo_subtype = props.get("geo", shape_type)
            components.append({
                "id": shape_id,
                "label": label,
                "geo": geo_subtype,
                "x": x,
                "y": y,
            })

        elif shape_type == "arrow":
            start_binding = props.get("start", {})
            end_binding = props.get("end", {})
            start_id = start_binding.get("boundShapeId")
            end_id = end_binding.get("boundShapeId")
            arrow_label = (props.get("text") or "").strip()
            arrows.append({
                "start_id": start_id,
                "end_id": end_id,
                "label": arrow_label,
            })

        elif shape_type == "text":
            text_content = (props.get("text") or "").strip()
            if text_content:
                annotations.append({
                    "text": text_content,
                    "x": x,
                    "y": y,
                })

        # Skip 'draw' (freehand) and other types

    if not components and not annotations:
        return EMPTY_DIAGRAM

    # Build component index for arrow resolution
    comp_index = {}
    for i, comp in enumerate(components, 1):
        comp_index[comp["id"]] = (i, comp["label"])

    # Compute spatial grid positions (3x3)
    all_positions = [(c["x"], c["y"]) for c in components]
    if annotations:
        all_positions += [(a["x"], a["y"]) for a in annotations]
    grid_labels = _compute_grid_labels(all_positions, components, annotations)

    # Check if we need to summarize
    if len(components) > MAX_COMPONENTS:
        return _summarize(components, arrows, annotations)

    # Format output
    lines = ["[CANDIDATE'S DIAGRAM]"]

    if components:
        lines.append("Components:")
        for comp in components:
            idx, label = comp_index[comp["id"]]
            label_str = f'"{label}" ' if label else ""
            grid_pos = grid_labels.get(comp["id"], "")
            pos_str = f", {grid_pos}" if grid_pos else ""
            lines.append(f"  [{idx}] {label_str}({comp['geo']}{pos_str})")

    if arrows:
        lines.append("Connections:")
        for arrow in arrows:
            start = comp_index.get(arrow["start_id"])
            end = comp_index.get(arrow["end_id"])
            if start and end:
                label_str = f' (labeled: "{arrow["label"]}")' if arrow["label"] else ""
                start_label = f'"{start[1]}"' if start[1] else f"[{start[0]}]"
                end_label = f'"{end[1]}"' if end[1] else f"[{end[0]}]"
                lines.append(
                    f"  [{start[0]}] {start_label} -> [{end[0]}] {end_label}{label_str}"
                )
            elif arrow["label"]:
                lines.append(f"  (unconnected arrow: \"{arrow['label']}\")")

    if annotations:
        lines.append("Annotations:")
        for ann in annotations:
            nearest = _find_nearest_component(ann["x"], ann["y"], components, comp_index)
            near_str = f" (near [{nearest[0]}] \"{nearest[1]}\")" if nearest else ""
            lines.append(f'  "{ann["text"]}"{near_str}')

    lines.append("[END DIAGRAM]")
    return "\n".join(lines)


def _compute_grid_labels(
    all_positions: list[tuple],
    components: list[dict],
    annotations: list[dict],
) -> dict[str, str]:
    """Map component IDs to spatial grid labels (e.g., 'top-left')."""
    if not all_positions:
        return {}

    xs = [p[0] for p in all_positions]
    ys = [p[1] for p in all_positions]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    range_x = max_x - min_x if max_x != min_x else 1
    range_y = max_y - min_y if max_y != min_y else 1

    v_labels = ["top", "center", "bottom"]
    h_labels = ["left", "center", "right"]

    result = {}
    for comp in components:
        nx = (comp["x"] - min_x) / range_x
        ny = (comp["y"] - min_y) / range_y

        col = min(int(nx * 3), 2)
        row = min(int(ny * 3), 2)

        v = v_labels[row]
        h = h_labels[col]
        if v == "center" and h == "center":
            result[comp["id"]] = "center"
        elif v == "center":
            result[comp["id"]] = h
        elif h == "center":
            result[comp["id"]] = v
        else:
            result[comp["id"]] = f"{v}-{h}"

    return result


def _find_nearest_component(
    x: float,
    y: float,
    components: list[dict],
    comp_index: dict,
) -> tuple[int, str] | None:
    """Find the nearest component to (x, y) by Euclidean distance."""
    if not components:
        return None

    best = None
    best_dist = float("inf")
    for comp in components:
        dist = math.hypot(comp["x"] - x, comp["y"] - y)
        if dist < best_dist:
            best_dist = dist
            best = comp_index[comp["id"]]

    return best


def _summarize(
    components: list[dict],
    arrows: list[dict],
    annotations: list[dict],
) -> str:
    """Produce a brief summary when the diagram is too large for full serialization."""
    labeled = [c for c in components if c["label"]]
    key_labels = [c["label"] for c in labeled[:10]]

    lines = [
        "[CANDIDATE'S DIAGRAM]",
        f"Large diagram with {len(components)} components and {len(arrows)} connections.",
    ]
    if key_labels:
        lines.append(f"Key components: {', '.join(key_labels)}")
    if annotations:
        lines.append(f"{len(annotations)} text annotations present.")
    lines.append("[END DIAGRAM]")
    return "\n".join(lines)
