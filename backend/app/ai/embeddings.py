"""Text embeddings for semantic search.

Offline: a deterministic hashing bag-of-words vector (no model download) that
still ranks "person near entrance" above unrelated cues. When
sentence-transformers is installed, real embeddings are used instead. Cosine
similarity is computed in Python (offline) or pgvector (Supabase) later.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
from functools import lru_cache
from typing import List

logger = logging.getLogger("subli.embed")

DIM = 384
_WORD = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def _model():
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        logger.info("Loading sentence-transformers model...")
        return SentenceTransformer("all-MiniLM-L6-v2")
    except Exception:
        logger.info("sentence-transformers not installed; hashing embeddings.")
        return None


def _hash_embed(text: str) -> List[float]:
    vec = [0.0] * DIM
    for tok in _WORD.findall(text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % DIM] += 1.0
        vec[(h // DIM) % DIM] += 0.5     # a second bucket reduces collisions
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(text: str) -> List[float]:
    m = _model()
    if m is not None:
        return m.encode(text, normalize_embeddings=True).tolist()
    return _hash_embed(text)


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)
