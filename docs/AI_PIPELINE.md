# AI Pipeline

`backend/app/ai/` + `backend/app/worker/processor.py`. Each stage reports
progress to the `processing_jobs` row.

## Stages

| Stage | Module | Real backend | Offline fallback |
|-------|--------|--------------|------------------|
| metadata | `sampling.py` | OpenCV probe | same |
| sampling | `sampling.py` | scene-change + motion keyframes | same (background subtraction) |
| detection | `detection.py` | YOLOv8 → Subli labels | foreground blobs classified by shape |
| tracking | `pipeline.py` | (YOLO+tracker) | anonymous Person #N presence |
| ocr | `ocr.py` | EasyOCR / Tesseract | none (never fabricated) |
| captioning | `captioning.py` | BLIP image-to-text | heuristic scene describer |
| temporal | `analysis.py` | environment states from counts | same |
| events | `analysis.py` | state-delta event engine | same |
| graph | `analysis.py` | sequential leads_to relations | same |
| embeddings | `embeddings.py` | sentence-transformers | hashing bag-of-words |
| subtitles | `analysis.py` | smoothed `.srt`/`.vtt` | same |

## Detection labels (spec §18)
`person, car, truck, bus, motorcycle, bicycle, bag, backpack, chair, door,
animal, phone`. Offline blobs are coarse (`person`/`vehicle`/`object` by aspect
ratio); install `ultralytics` for real classes.

## Event types (spec §23)
`PERSON_ENTERED, PERSON_LEFT, VEHICLE_ARRIVED, VEHICLE_LEFT, MULTIPLE_PEOPLE,
SCENE_CHANGED` (extendable). Neutral, observational language only.

## Reasoning (`reasoning.py`, spec §30)
`ClaudeReasoningService` with methods `answer_question`, `find_story`,
`compare_states`. Offline it computes grounded answers from stored
events/states/OCR; with `CLAUDE_API_KEY` it sends the same structured facts to
Claude for phrasing. It never fabricates — if the facts don't cover a question
it returns *"I couldn't determine that from the analyzed footage."*

## Enable real models
```bash
pip install transformers torch          # BLIP captioning
pip install ultralytics                 # YOLO detection
pip install easyocr                     # OCR
pip install sentence-transformers       # embeddings
pip install anthropic                   # Claude (+ set CLAUDE_API_KEY)
```
Set `FORCE_FALLBACK=0`. Everything else is automatic.
