# Contributing Guide

## Development Setup
1. Clone the repository.
2. Copy `.env.example` to `.env` and fill only the keys you need.
3. Start backend:
   - `python3.11 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r backend/requirements.txt`
   - `python -m backend.app`
4. Start frontend:
   - `npm install`
   - `npm run dev`

## Branching
- Prefer short feature branches.
- Suggested format: `feature/<topic>` or `fix/<topic>`.
- For Codex-assisted changes, `codex/<topic>` is recommended.

## Pull Request Checklist
- Explain user impact and technical impact.
- Include screenshots for UI changes.
- Mention any demo-mode behavior added/changed.
- Confirm local checks passed:
  - `python3 -m compileall backend`
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## Code Standards
- Keep Pathway streaming logic in backend pipeline modules, not UI.
- Avoid hardcoding secrets in source files.
- Prefer typed API payloads and explicit response shapes.
- Add comments only where logic is non-obvious.

## Demo vs Production
- Demo-only features must be labeled in UI (for example, synthetic rotating report summaries).
- Production-facing features should use real stream data or clearly defined fallbacks.
