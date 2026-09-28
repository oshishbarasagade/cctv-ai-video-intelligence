"""ClaudeReasoningService — the AI reasoning layer (spec §30).

Backend-only. Grounded strictly in stored analysis data — never fabricates
(spec §62). Offline: deterministic answers computed from events/states/OCR with
real timestamps. When CLAUDE_API_KEY is set, the same structured context is sent
to Claude for natural-language phrasing; the grounding rules are unchanged.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from .. import config

logger = logging.getLogger("subli.reason")

CANNOT = "I couldn't determine that from the analyzed footage."


def _fmt_ts(sec: float) -> str:
    s, m = int(sec) % 60, int(sec) // 60
    return f"{m:02d}:{s:02d}"


class ClaudeReasoningService:
    """One service, two backends (offline templates / Claude)."""

    def __init__(self):
        self.claude = None
        self.edge_url = config.CLAUDE_EDGE_URL or ""
        self._edge_disabled = False
        if config.CLAUDE_ENABLED:
            try:
                import anthropic  # type: ignore
                self.claude = anthropic.Anthropic(api_key=config.CLAUDE_API_KEY)
                logger.info("Claude reasoning enabled (direct API).")
            except Exception as exc:  # pragma: no cover
                logger.warning("Claude init failed (%s); offline reasoning.", exc)
        elif self.edge_url:
            logger.info("Claude reasoning via Edge Function: %s", self.edge_url)

    @property
    def llm_available(self) -> bool:
        return bool(self.claude) or (bool(self.edge_url) and not self._edge_disabled)

    def _llm(self, system: str, prompt: str, max_tokens: int = 700):
        """Return model text, or None to fall back to the grounded answer."""
        if self.claude:  # pragma: no cover - needs a real key
            try:
                msg = self.claude.messages.create(
                    model="claude-3-5-sonnet-latest", max_tokens=max_tokens,
                    system=system, messages=[{"role": "user", "content": prompt}])
                return msg.content[0].text
            except Exception as exc:
                logger.warning("Claude direct call failed (%s).", exc)
                return None
        if self.edge_url and not self._edge_disabled:
            try:
                import httpx
                headers = {"Content-Type": "application/json"}
                if config.SUPABASE_ANON_KEY:
                    headers["Authorization"] = f"Bearer {config.SUPABASE_ANON_KEY}"
                r = httpx.post(self.edge_url, json={
                    "system": system, "prompt": prompt, "max_tokens": max_tokens,
                    "model": config.CLAUDE_MODEL},
                    headers=headers, timeout=30)
                if r.status_code == 200:
                    return r.json().get("text") or None
                logger.warning("Claude edge %s: %s", r.status_code, r.text[:200])
                if r.status_code in (404, 401, 403, 500):
                    self._edge_disabled = True  # not deployed / no secret yet
            except Exception as exc:
                logger.warning("Claude edge call failed (%s); disabling.", exc)
                self._edge_disabled = True
        return None

    _SYSTEM = ("You are Subli, a video-analysis assistant. Answer ONLY from the "
               "provided analysis facts. Always keep the timestamps. If the facts "
               "do not cover the question, say you couldn't determine it. Never "
               "invent objects, people, or events.")

    # -- public API ---------------------------------------------------------
    def answer_question(self, question: str, ctx: Dict) -> Dict:
        grounded = self._offline_answer(question, ctx)      # compute real facts
        if self.llm_available:
            txt = self._llm(self._SYSTEM,
                            f"Question: {question}\n\nAnalysis facts:\n{grounded['answer']}")
            if txt:
                return {"answer": txt, "citations": grounded["citations"]}
        return grounded

    def find_story(self, ctx: Dict) -> Dict:
        events = ctx.get("events", [])
        if not events:
            return {"answer": CANNOT, "citations": []}
        lines, cites = [], []
        for e in events:
            ts = e["start_time"]
            lines.append(f"At {_fmt_ts(ts)}, {e['description']}")
            cites.append({"ts": ts, "type": e["type"]})
        story = " ".join(lines)
        if self.llm_available:
            txt = self._llm(self._SYSTEM,
                            "Rewrite these timestamped observations as a neutral, "
                            "chronological narrative. Keep every timestamp.\n\n" + story)
            if txt:
                story = txt
        return {"answer": story, "citations": cites}

    def compare_states(self, a: Optional[Dict], b: Optional[Dict],
                       ts_a: float, ts_b: float) -> Dict:
        if not a or not b:
            return {"answer": CANNOT, "before": a, "after": b, "changes": []}
        changes = []
        for key in sorted(set(a) | set(b)):
            va, vb = a.get(key), b.get(key)
            if va != vb:
                changes.append({"field": key, "before": va, "after": vb})
        summary = (f"Between {_fmt_ts(ts_a)} and {_fmt_ts(ts_b)}: " +
                   ("; ".join(f"{c['field']} {c['before']} -> {c['after']}"
                             for c in changes) if changes else "no measured change."))
        if self.llm_available and changes:
            txt = self._llm(self._SYSTEM,
                            "Explain these structured differences between two "
                            f"moments in one neutral sentence:\n{changes}")
            if txt:
                summary = txt
        return {"answer": summary, "before": a, "after": b, "changes": changes}

    # -- offline grounded answering ----------------------------------------
    def _offline_answer(self, q: str, ctx: Dict) -> Dict:
        ql = q.lower()
        events: List[Dict] = ctx.get("events", [])
        ocr: List[Dict] = ctx.get("ocr", [])

        def by_types(types) -> List[Dict]:
            return [e for e in events if e["type"] in types]

        # text / OCR questions
        if any(w in ql for w in ("text", "sign", "read", "written", "ocr")):
            if not ocr:
                return {"answer": "No readable text was detected in the footage.",
                        "citations": []}
            items = ", ".join(f'"{o["text"]}" at {_fmt_ts(o["ts"])}' for o in ocr[:8])
            return {"answer": f"Detected text: {items}.",
                    "citations": [{"ts": o["ts"]} for o in ocr[:8]]}

        # vehicles
        if any(w in ql for w in ("vehicle", "car", "truck", "bus")):
            ev = by_types({"VEHICLE_ARRIVED", "VEHICLE_LEFT"})
            return self._list_answer(ev, "vehicle events")

        # people / person / first appear
        if "first" in ql and ("person" in ql or "people" in ql or "appear" in ql):
            ev = by_types({"PERSON_ENTERED"})
            if ev:
                return {"answer": f"The first person appeared at "
                        f"{_fmt_ts(ev[0]['start_time'])}.",
                        "citations": [{"ts": ev[0]["start_time"]}]}
            return {"answer": CANNOT, "citations": []}
        if any(w in ql for w in ("person", "people", "someone", "who")):
            ev = by_types({"PERSON_ENTERED", "PERSON_LEFT", "MULTIPLE_PEOPLE"})
            return self._list_answer(ev, "people events")

        # what changed after X (fallback to summary)
        if any(w in ql for w in ("summar", "what happen", "overview", "5 minutes",
                                  "five minutes")):
            return self.find_story(ctx if "5 minutes" not in ql and
                                   "five minutes" not in ql else
                                   {"events": [e for e in events
                                               if e["start_time"] <= 300]})

        # generic: give the event summary
        if events:
            return self._list_answer(events, "detected events")
        return {"answer": CANNOT, "citations": []}

    def _list_answer(self, events: List[Dict], label: str) -> Dict:
        if not events:
            return {"answer": f"No {label} were detected.", "citations": []}
        lines = [f"{_fmt_ts(e['start_time'])} — {e['description']}" for e in events[:12]]
        return {"answer": f"Found {len(events)} {label}:\n" + "\n".join(lines),
                "citations": [{"ts": e["start_time"], "type": e["type"]}
                              for e in events[:12]]}

service = ClaudeReasoningService()
