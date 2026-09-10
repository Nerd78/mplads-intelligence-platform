# MPLADS Intelligence Platform - Frontend

TanStack Start + React 19 + shadcn/ui dashboard for the
[MPLADS Intelligence Platform](../README.md). Talks to the FastAPI backend
in `../backend/` - it never computes a risk score itself, only displays
what the detection engine and API return.

## Pages

Command Center · National/State/District/MP Intelligence · Risk Queue ·
Works · Payments · Risk Map · Model Evaluation.

## Development

```bash
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm install
npm run dev
```

The backend (`../backend/`) must be running and its database populated
(see the root README) for any page to show real data.
