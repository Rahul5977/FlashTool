import base64
import json
import logging
import urllib.request
import urllib.error

from google.genai import types

from .prompts import (
    parse_script_for_characters_prompt,
    imagen_character_prompt,
    build_director_prompts_system,
)

logger = logging.getLogger(__name__)

# PHASE 1 — Parser Agent
def parse_script_for_characters(client, script: str) -> dict:
    """
    Use Gemini to read the ad script and output JSON containing an array of
    characters. Each character has: id, name, physical_baseline, outfit.
    """
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=parse_script_for_characters_prompt(script),
    )

    if response is None or response.text is None:
        raise RuntimeError("Gemini returned empty response when parsing characters")

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(raw)
    return data

# PHASE 2 — Imagen Agent
def auto_generate_character_image(api_key: str, physical_baseline: str, outfit: str) -> str:
    """
    Call the Google Imagen 3 API to generate a photorealistic 9:16 portrait.
    Returns the base64-encoded image string.
    """
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"imagen-3.0-generate-001:predict?key={api_key}"
    )

    prompt = imagen_character_prompt(physical_baseline, outfit)

    payload = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "9:16",
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        logger.error(f"Imagen API error {e.code}: {error_body}")
        raise RuntimeError(f"Imagen API returned HTTP {e.code}: {error_body}") from e

    predictions = body.get("predictions", [])
    if not predictions:
        raise RuntimeError("Imagen API returned no predictions")

    b64_image = predictions[0].get("bytesBase64Encoded", "")
    if not b64_image:
        raise RuntimeError("Imagen API returned empty image data")

    return b64_image


# PHASE 3 — Director Agent
def build_director_prompts(client, script: str, characters_json: dict, num_clips: int) -> list:
    """
    Returns a list of clip dicts: [{clip, scene_summary, last_frame, prompt}].
    """

    # Build character context block with exhaustive detail
    char_lines = []
    for char in characters_json.get("characters", []):
        char_lines.append(
            f"[{char['name']}] LOCKED APPEARANCE (copy verbatim into every prompt, zero shortcuts):\n"
            f"  {char.get('physical_baseline', '')}"
        )
        char_lines.append(
            f"[{char['name']}] LOCKED OUTFIT (copy verbatim into every prompt, zero shortcuts):\n"
            f"  {char.get('outfit', '')}"
        )
    character_block = "\n".join(char_lines)

    # Build system prompt
    system = build_director_prompts_system(num_clips)

    user_text = (
        f"SUPERLIVING AD SCRIPT:\n{script}\n\n"
        f"LOCKED CHARACTER PROFILES (copy these verbatim into every clip's OUTFIT & APPEARANCE section):\n"
        f"{character_block}\n\n"
        f"Generate exactly {num_clips} clip prompts as JSON now."
    )

    response = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=[types.Part.from_text(text=user_text)],
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.15,  # Very low temperature = maximum rule adherence
        ),
    )

    if response is None or response.text is None:
        raise RuntimeError("Gemini returned empty response when building director prompts")

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(raw)
    return data["clips"]