# API Reference

Base URL `http://127.0.0.1:8000` (dev proxy: `/api`). Interactive docs: `/docs`.
All routes except `/health` and `/auth/*` require `Authorization: Bearer <token>`.
Errors share `{ "status": "error", "message": "...", "code": <int> }`.

## Auth
| Method | Path | Body |
|--------|------|------|
| POST | `/auth/signup` | `{full_name,email,password}` → `{token,user}` |
| POST | `/auth/login` | `{email,password}` → `{token,user}` |
| GET | `/auth/me` | → user |
| POST | `/auth/onboarding` | `{full_name?,use_case?,experience?,completed}` |

## Projects & dashboard
| POST/GET | `/projects` | create / list (with counts) |
| GET/PATCH/DELETE | `/projects/{id}` | read (with videos) / update / delete |
| GET | `/dashboard/metrics` | videos, events, people, objects, projects |
| GET | `/dashboard/analytics` | event/object distribution, activity |

## Videos & processing
| POST | `/videos/upload` | multipart `project_id, mode, file` → `{video_id,job_id}` |
| GET | `/videos/jobs/{id}` | job status/stage/progress |
| POST | `/videos/jobs/{id}/retry` | re-run a failed job |

## Analysis (read)
`GET /analysis/{video_id}/` + `overview · events · graph · objects · people ·
ocr · captions · states · keyframes · stream · frame?ts= · subtitles.srt|vtt`

## Search & reasoning
| POST | `/search` | `{video_id,query,limit}` → ranked results w/ timestamps |
| POST | `/chat/ask` | `{video_id,question}` → grounded answer + citations |
| POST | `/chat/find-story?video_id=` | chronological narrative |
| POST | `/chat/what-changed` | `{video_id,ts_a,ts_b}` → before/after diff |

## Evidence & reports
| POST/GET/DELETE | `/evidence` · `/evidence/{project_id}` · `/evidence/{id}` |
| POST | `/reports/{video_id}/generate` → `{download_url}` |
| GET | `/reports/{report_id}/download` (PDF) |

## Live
| POST/GET/DELETE | `/live/zones` · `/live/zones/{id}` |
| POST/GET | `/live/alerts` · `/live/alerts/log` |
| POST/GET | `/live/cameras` |

## Demo
| POST | `/demo/seed` → seeds a project + analyzed video, returns `{project_id,video_id}` |
