# Advanced Features — Audit & Plan

Audit of the existing platform and the plan to add the 20 requested features
**without rebuilding or breaking anything**. Real data only.

## Audit: what already exists (reuse, don't rebuild)
| Requested | Status today | Action |
|-----------|--------------|--------|
| 3. What Changed? | ✅ `/chat/what-changed` + RightPanel button | keep; add dedicated tool UI |
| 6. Source-linked Ask Subli | ✅ answers already return clickable `citations` | enhance prompt to always cite |
| 7. NL semantic search | ✅ real embeddings + `/search` | add thumbnails + explanation |
| 8. Evidence | ✅ basic (`/evidence`) | upgrade → notes/tags/etc (needs migration) |
| 11. Reports | ✅ PDF (`/reports`) | add section selection |
| 14. Processing modes | ✅ QUICK/BALANCED/DEEP already change sampling | keep |
| 16. Keyboard / ⌘K | ✅ partial (Space/arrows/J/L) + palette | complete the set |
| 5. Event graph | ✅ data `/analysis/{id}/graph` | build the visual UI |
| 4. Video Memory | ✅ data `environment_states` | build the visual UI |
| 12. Quality panel | ⚠️ data in job/summary | expose as panel |

## New backend endpoints (all read existing DB rows / Claude)
- `GET /analysis/{id}/highlights` — compute AI highlights from events + states + objects (importance score). No new tables.
- `GET /analysis/{id}/explain?ts=` — gather people/objects/ocr/caption/state/events near ts → grounded Claude explanation.
- `GET /analysis/{id}/memory` — chronological state-change memory from `environment_states` + events.
- `GET /analysis/{id}/quality` — frames/scenes/objects/tracks/ocr/events/embeddings counts + warnings.
- `GET /projects/{id}/search?q=` — project-wide search across events/objects/ocr/evidence.

## Database changes (minimal)
- **Evidence 2.0** needs new columns on `evidence`: `note`, `tags` (jsonb), `title`, `sort`. → migration `0004_evidence.sql` (user runs once). Everything else reuses existing tables.

## Conflicts / risks
- None to existing flows — all additions are new endpoints/panels. Evidence columns are additive (nullable), backward-compatible.
- Claude features degrade to grounded-offline if the edge function is down (existing behavior).

## Order (each: implement → typecheck → build → real-video test → next)
1. AI Highlights (backend + workspace panel) — high value, no migration
2. Explain This Moment (backend + player action)
3. Video Memory panel (frontend over existing data)
4. AI Event Graph visual (frontend over existing `/graph`)
5. Analysis Quality panel (backend + panel)
6. Project-level search (backend + UI)
7. Evidence Board 2.0 (migration + backend + Evidence page)
8. Report builder sections, Investigation workspace, Video comparison (larger; later)

## Definition of done (per feature)
Real DB/CV/Claude data · seeks to correct timestamps · "No analyzed data available"
when empty · no fake values · existing features untouched · build+tests green.
