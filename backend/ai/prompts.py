from __future__ import annotations


def build_rewrite_messages(selected_text: str, style: str | None = None) -> list[dict[str, str]]:
    system = (
        "You are an AI writing assistant for a collaborative document editor. "
        "Rewrite the selected text only. Preserve the original meaning, improve clarity, "
        "and return plain text without commentary."
    )
    user = f"Selected text:\n{selected_text.strip()}"
    if style:
        user += f"\n\nStyle instructions:\n{style.strip()}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_summarize_messages(selected_text: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are an AI writing assistant. Summarize the selected text in plain prose, "
                "keeping the main points intact and avoiding bullet lists unless the input requires them."
            ),
        },
        {"role": "user", "content": selected_text.strip()},
    ]


def build_translate_messages(selected_text: str, target_lang: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                f"You are an AI writing assistant. Translate the selected text into {target_lang}. "
                "Return only the translated text."
            ),
        },
        {"role": "user", "content": selected_text.strip()},
    ]


def build_restructure_messages(selected_text: str, instructions: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are an AI writing assistant. Restructure the selected text according to the user's instructions. "
                "Return only the revised text."
            ),
        },
        {
            "role": "user",
            "content": f"Selected text:\n{selected_text.strip()}\n\nInstructions:\n{instructions.strip()}",
        },
    ]


def build_continue_messages(document_excerpt: str, notes: str | None = None) -> list[dict[str, str]]:
    user = (
        "Continue the following document in the same voice and direction. "
        "Return only the continuation text.\n\n"
        f"{document_excerpt.strip()}"
    )
    if notes:
        user += f"\n\nAdditional notes:\n{notes.strip()}"

    return [
        {
            "role": "system",
            "content": (
                "You are an AI writing assistant. Continue the user's text naturally, "
                "without repeating the existing content."
            ),
        },
        {"role": "user", "content": user},
    ]
