from __future__ import annotations

import math


class AIQuotaExceededError(Exception):
    """Raised when a user cannot spend more AI tokens."""


def estimate_tokens(*texts: str | None) -> int:
    total = 0
    for text in texts:
        if not text:
            continue
        total += max(1, math.ceil(len(text) / 4))
    return total
