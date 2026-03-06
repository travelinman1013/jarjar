"""Post-session analysis and scoring.

Sends the full transcript to the LLM for structured
feedback across clarity, structure, depth, and other dimensions.
"""

import json
import re

from .llm import client, LLM_MODEL

FILLER_PATTERN = re.compile(
    r"\b(um|uh|like|you know|basically)\b", re.IGNORECASE
)


def count_filler_words(transcripts: list[dict]) -> int:
    """Count filler word occurrences in user transcript entries."""
    count = 0
    for t in transcripts:
        if t["speaker"] == "user":
            count += len(FILLER_PATTERN.findall(t["text"]))
    return count


async def generate_feedback(
    session_id: int,
    transcripts: list[dict],
    scenario_name: str,
    evaluation_criteria: list[str],
    retriever=None,
    knowledge_collections: list[str] | None = None,
) -> dict:
    """Call LLM to generate structured JSON feedback for a completed session."""
    transcript_text = "\n".join(
        f"[{t['speaker'].upper()}]: {t['text']}" for t in transcripts
    )

    system_prompt = (
        "You are an expert interview coach. Analyze the following interview "
        "transcript and provide structured feedback.\n\n"
        "You MUST respond with ONLY valid JSON. Do not include any text outside "
        "the JSON object. Use exactly this JSON schema:\n"
        "{\n"
        '  "overall_score": <integer 0-10>,\n'
        '  "clarity_score": <integer 0-10>,\n'
        '  "structure_score": <integer 0-10>,\n'
        '  "depth_score": <integer 0-10>,\n'
        '  "best_moment": "<one sentence quoting or describing their strongest answer>",\n'
        '  "biggest_opportunity": "<one sentence of actionable improvement advice>",\n'
        '  "technical_accuracy_notes": "<any incorrect claims or missed key concepts, or empty string if N/A>"\n'
        "}\n\n"
        "Score descriptions:\n"
        "- clarity_score: How clearly and concisely the candidate communicated\n"
        "- structure_score: How well-organized and logical the responses were\n"
        "- depth_score: How thoroughly the candidate explored topics with examples\n"
        "- overall_score: Holistic assessment of interview performance"
    )

    # RAG: retrieve reference material for grounded evaluation
    rag_section = ""
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
                rag_section = (
                    "\n\nWhen evaluating technical accuracy, cross-reference the "
                    "candidate's claims against the following reference material. "
                    "Note any incorrect claims or missed key concepts in "
                    "technical_accuracy_notes.\n\n"
                    + retriever.format_context(chunks)
                )
        except Exception:
            pass

    user_prompt = (
        f"Scenario: {scenario_name}\n"
        f"Evaluation criteria: {', '.join(evaluation_criteria)}\n\n"
        f"Transcript:\n{transcript_text}"
        f"{rag_section}"
    )

    response = await client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=1024,
        response_format={"type": "json_object"},
    )

    try:
        content = response.choices[0].message.content
        content = content.replace('```json', '').replace('```', '').strip()
        return json.loads(content)
    except (json.JSONDecodeError, IndexError, AttributeError):
        return {
            "overall_score": 5,
            "clarity_score": 5,
            "structure_score": 5,
            "depth_score": 5,
            "best_moment": "Unable to generate detailed feedback.",
            "biggest_opportunity": "Try again with a longer interview session.",
        }
