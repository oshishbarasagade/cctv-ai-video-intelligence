"""PDF report generation (spec §33).

Pulls the stored analysis for a video and renders a professional PDF: metadata,
executive summary, event timeline, object/OCR tables, AI observations, and the
required AI-disclaimer. Uses reportlab when available; otherwise writes a clean
plain-text .txt fallback so the feature still works offline.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import List

from . import config, store
from .ai.reasoning import service


def _fmt_ts(sec: float) -> str:
    s, m = int(sec) % 60, int(sec) // 60
    return f"{m:02d}:{s:02d}"


DISCLAIMER = ("AI-generated observations may contain errors and should be "
              "reviewed by a human. Subli uses anonymous tracking only and does "
              "not perform facial recognition or identity inference.")


def _gather(video_id: str, uid: str) -> dict:
    video = store.get("videos", video_id, uid)
    events = store.list_where("events", uid, "video_id=?", (video_id,), "start_time asc")
    objects = store.list_where("objects", uid, "video_id=?", (video_id,))
    ocr = store.list_where("ocr_results", uid, "video_id=?", (video_id,), "ts asc")
    subjects = store.list_where("subjects", uid, "video_id=?", (video_id,))
    counts: dict = {}
    for o in objects:
        counts[o["type"]] = counts.get(o["type"], 0) + 1
    story = service.find_story({"events": events}).get("answer", "")
    return {"video": video, "events": events, "counts": counts, "ocr": ocr,
            "subjects": subjects, "story": story}


ALL_SECTIONS = ["summary", "timeline", "objects", "ocr"]


def generate(video_id: str, uid: str, sections: list | None = None) -> Path:
    data = _gather(video_id, uid)
    data["_sections"] = set(sections) if sections else set(ALL_SECTIONS)
    out_dir = config.ARTIFACT_DIR / uid / video_id
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        path = out_dir / "report.pdf"
        _render_pdf(path, data)
        return path
    except Exception:
        path = out_dir / "report.txt"
        _render_txt(path, data)
        return path


def _render_pdf(path: Path, d: dict) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)
    from reportlab.lib import colors

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=A4, title="Subli Analysis Report")
    v = d["video"] or {}
    flow: List = []

    flow.append(Paragraph("Subli — Video Analysis Report", styles["Title"]))
    flow.append(Paragraph(v.get("original_name", "video"), styles["Normal"]))
    flow.append(Spacer(1, 0.4 * cm))

    # Metadata table
    meta = [
        ["Duration", f"{v.get('duration_sec', 0):.1f}s"],
        ["Resolution", f"{v.get('width','?')}x{v.get('height','?')}"],
        ["FPS", f"{v.get('fps','?')}"],
        ["Events", str(len(d["events"]))],
        ["People (anonymous)", str(len(d["subjects"]))],
        ["Generated", time.strftime("%Y-%m-%d %H:%M")],
    ]
    t = Table(meta, colWidths=[5 * cm, 9 * cm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FAFAFA")),
        ("FONTSIZE", (0, 0), (-1, -1), 9)]))
    flow += [t, Spacer(1, 0.5 * cm)]

    sec = d.get("_sections", set(ALL_SECTIONS))

    if "summary" in sec:
        flow.append(Paragraph("Executive Summary", styles["Heading2"]))
        flow.append(Paragraph(d["story"] or "No significant events detected.",
                              styles["Normal"]))
        flow.append(Spacer(1, 0.4 * cm))

    if "timeline" in sec and d["events"]:
        flow.append(Paragraph("Event Timeline", styles["Heading2"]))
        rows = [["Time", "Event", "Description"]] + [
            [_fmt_ts(e["start_time"]), e["type"].replace("_", " ").title(),
             e.get("description", "")] for e in d["events"][:40]]
        et = Table(rows, colWidths=[2 * cm, 4 * cm, 8 * cm])
        et.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8)]))
        flow += [et, Spacer(1, 0.4 * cm)]

    if "objects" in sec and d["counts"]:
        flow.append(Paragraph("Detected Objects", styles["Heading2"]))
        rows = [["Type", "Count"]] + [[k, str(v)] for k, v in
                                      sorted(d["counts"].items(), key=lambda x: -x[1])]
        ot = Table(rows, colWidths=[6 * cm, 3 * cm])
        ot.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
            ("FONTSIZE", (0, 0), (-1, -1), 9)]))
        flow += [ot, Spacer(1, 0.4 * cm)]

    if "ocr" in sec and d["ocr"]:
        flow.append(Paragraph("Detected Text (OCR)", styles["Heading2"]))
        for o in d["ocr"][:20]:
            flow.append(Paragraph(f'{_fmt_ts(o["ts"])} — "{o["text"]}"', styles["Normal"]))
        flow.append(Spacer(1, 0.4 * cm))

    flow.append(Spacer(1, 0.4 * cm))
    flow.append(Paragraph("<b>Disclaimer.</b> " + DISCLAIMER, styles["Italic"]))
    doc.build(flow)


def _render_txt(path: Path, d: dict) -> None:
    v = d["video"] or {}
    lines = ["SUBLI — VIDEO ANALYSIS REPORT", "=" * 40,
             f"File: {v.get('original_name','video')}",
             f"Duration: {v.get('duration_sec',0):.1f}s   Events: {len(d['events'])}   "
             f"People: {len(d['subjects'])}",
             "", "EXECUTIVE SUMMARY", "-" * 40, d["story"] or "No significant events.",
             "", "EVENT TIMELINE", "-" * 40]
    for e in d["events"]:
        lines.append(f"{_fmt_ts(e['start_time'])}  {e['type']:<16} {e.get('description','')}")
    lines += ["", "DETECTED OBJECTS", "-" * 40]
    for k, n in sorted(d["counts"].items(), key=lambda x: -x[1]):
        lines.append(f"{k:<16} {n}")
    if d["ocr"]:
        lines += ["", "TEXT (OCR)", "-" * 40]
        lines += [f'{_fmt_ts(o["ts"])}  "{o["text"]}"' for o in d["ocr"]]
    lines += ["", "-" * 40, DISCLAIMER]
    path.write_text("\n".join(lines), encoding="utf-8")
