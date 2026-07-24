# CivicDesk AI — Civic Infrastructure Reporting Platform (Backend)

> **Competition:** AI & API Hackathon 2026 — First Edition
> **Organizer:** IEEE Computer Society — SEU Student Branch Chapter
> **Project type:** Full-stack AI-powered civic infrastructure reporting platform — **this repo contains the backend API**.

> **⚠️ Note:** This API is hosted on Render's free tier. The server spins down after inactivity, so the first request may take 30–60 seconds to respond while the instance cold-starts. Subsequent requests will be fast.

---

## Overview

**CivicDesk AI** is an AI-powered civic infrastructure platform that lets **citizens** report public-infrastructure problems (potholes, broken streetlights, water leaks, illegal dumping) and lets **government officials** review, prioritize, assign, and resolve them through a structured dashboard.

Every submission is processed through **OpenAI ChatGPT** for:
- **Category validation** against a fixed enum (`pothole`, `broken_streetlight`, `water_leak`, `illegal_dumping`, `other`)
- **Structured summarization** with confidence score
- **Severity assessment** (level + numeric score + plain-language rationale)
- **Embedding-based duplicate detection** (`text-embedding-3-small`) combined with geographic and temporal proximity

Reports can be tracked by citizens using a public **tracking code** (`CIV-XXXXXX`) with no login required and no PII exposed. Photo evidence is stored on **Cloudinary**.

---

## Live Deployment

| Resource | URL |
|----------|-----|
| **Base URL** | https://crisis-desk-backend.onrender.com |
| **Swagger API Docs** | https://crisis-desk-backend.onrender.com/api/docs |
| **GitHub Repository** | https://github.com/AbulBashar38/crisis-desk-backend |

---

## Architecture

```
Citizen submits report (with Cloudinary image URLs)
                │
                ▼
   ┌────────────────────────┐
   │ Zod validation         │
   └────────────────────────┘
                │
                ▼
   ┌────────────────────────┐
   │ ChatGPT categorization │  → category, summary, confidence
   └────────────────────────┘
                │
                ▼
   ┌────────────────────────┐
   │ ChatGPT severity       │  → level, score, rationale
   └────────────────────────┘
                │
                ▼
   ┌────────────────────────┐
   │ Embedding generation   │  → text-embedding-3-small
   └────────────────────────┘
                │
                ▼
   ┌────────────────────────┐
   │ Duplicate detection    │  → semantic + category + geo + time
   └────────────────────────┘
                │
                ▼
   ┌────────────────────────┐
   │ Persist + tracking code│  → CIV-XXXXXX, initial progress note
   └────────────────────────┘
```

---

## Tech Stack

| Layer          | Technology                                         |
| -------------- | -------------------------------------------------- |
| Runtime        | Node.js                                            |
| Framework      | Express.js 5                                       |
| Language       | TypeScript                                         |
| ORM            | Prisma (multi-file schema)                         |
| Database       | PostgreSQL (Neon DB)                               |
| AI             | **OpenAI ChatGPT** (`gpt-4o-mini` + `gpt-4o` fallback) |
| Embeddings     | `text-embedding-3-small` (OpenAI)                  |
| Image storage  | **Cloudinary**                                     |
| Auth           | JWT + bcryptjs (cookie or Bearer header)           |
| Validation     | Zod                                                |
| Rate Limiting  | `express-rate-limit`                               |
| Docs           | `swagger-jsdoc` + `swagger-ui-express`             |
| Testing        | Vitest + Supertest                                 |
| Frontend       | Next.js 15 + Tailwind + shadcn/ui (separate app)   |
| Maps           | Leaflet + OpenStreetMap (bonus)                    |

---

## Core Features (per hackathon modules)

| Module | Status | Notes |
|---|---|---|
| **1.** Citizen report submission (description, location, optional contact, optional photo) | ✅ | Returns unique tracking code |
| **2.** AI categorization + structured summary + confidence | ✅ | ChatGPT structured outputs |
| **3.** Severity scoring (level + score + rationale) | ✅ | Explainability surfaced to dashboard + tracking page |
| **4.** Duplicate detection (semantic + category + geo + time) | ✅ | Weighted score, never blocks submissions |
| **5.** Government dashboard (filters, search, assign, status, progress notes) | ✅ | Department-based assignment |
| **6.** Public progress tracking via tracking code (no PII) | ✅ | Returns public progress history only |
| **7.** Persistent DB + Cloudinary image storage | ✅ | PostgreSQL + Cloudinary URLs |

---

## Domain Model

### Categories
`pothole`, `broken_streetlight`, `water_leak`, `illegal_dumping`, `other`

### Severity Levels
`low`, `medium`, `high`, `critical` — paired with a numeric `severityScore` (0–1) and a `severityRationale` for explainability.

### Departments
`roads_and_highways`, `electrical`, `water_and_sewerage`, `waste_management`, `general`

### Status Lifecycle
`pending → under_review → assigned → in_progress → resolved | rejected`

### Progress Updates
Every status change creates a `ProgressUpdate` row. `visibility = public` shows the note on the tracking page; `visibility = internal` is admin-only.

---

## API Endpoints

### Public

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/reports` | Submit a new report (multipart JSON with `imageUrls[]`) |
| GET  | `/api/reports/track/:trackingCode` | Public tracking view (no PII) |
| POST | `/api/uploads/sign` | Optional Cloudinary signed-upload payload |
| GET  | `/api/health` | Health check |

### Admin (JWT, role = `admin`)

| Method | Endpoint | Purpose |
|---|---|---|
| POST   | `/api/auth/register` | Bootstrap admin (gated by env flag in prod) |
| POST   | `/api/auth/login` | Admin login → JWT token |
| GET    | `/api/reports` | List + filter + search + paginate |
| GET    | `/api/reports/:id` | Full report detail |
| PATCH  | `/api/reports/:id/assign` | Assign department + status |
| POST   | `/api/reports/:id/progress` | Add progress update (status + note + visibility) |
| GET    | `/api/reports/:id/duplicates` | List all reports linked as duplicates |
| GET    | `/api/reports/stats/summary` | Dashboard analytics |
| DELETE | `/api/reports/:id` | Soft-delete (sets `status = rejected`) |

---

## Report Submission Flow

When `POST /api/reports` is called:

1. **Validate** — Zod checks description, location, optional coordinates, optional `imageUrls[]`, category.
2. **Categorize (ChatGPT)** — returns `validatedCategory`, `summary` (citizen language), `canonicalSummary` (English), `normalizedLocation`, `confidence`.
3. **Severity (ChatGPT)** — returns `level`, `score`, `rationale` based on safety risk, scale, danger, sensitive-area proximity.
4. **Generate Embedding** — `text-embedding-3-small` over `Category + normalizedLocation + canonicalSummary`.
5. **Duplicate Detection** — weighted score over `semantic + category + geo (≤500m) + time (≤7d)`; if combined ≥ 0.80 → `duplicateOfId` linked.
6. **Tracking Code** — generate `CIV-XXXXXX` and store.
7. **Save** — persist report + initial `ProgressUpdate` (status = `pending`, note = "Report received", visibility = `public`).
8. **Respond** — return full report with `trackingCode` + AI fields.

---

## Duplicate Detection Strategy

```
Embedding Input (always English, regardless of report language):
─────────────────────────────────────────────────────────────────
Category: pothole
Location: Mirpur 10, Dhaka              ← ChatGPT-normalized
Summary: Large pothole near school      ← canonicalSummary
─────────────────────────────────────────────────────────────────

Weighted duplicate score:
  semantic     0.55   cosine similarity
  category     0.15   exact enum equality
  geo          0.20   Haversine distance ≤ 500 m
  time         0.10   within last 7 days

Threshold: 0.80 → duplicateOfId linked, possibleDuplicate = true
(Submission is never blocked.)
```

---

## Public Tracking Response Shape

`GET /api/reports/track/:trackingCode` returns (PII redacted):

```json
{
  "trackingCode": "CIV-7K2P9X",
  "description": "Large pothole near the school crossing...",
  "category": "pothole",
  "aiCategory": "pothole",
  "severityLevel": "high",
  "severityScore": 0.82,
  "severityRationale": "Pothole near a school crossing poses direct risk to children.",
  "status": "assigned",
  "assignedDepartment": "roads_and_highways",
  "imageUrls": ["https://res.cloudinary.com/.../civic-reports/CIV-7K2P9X/abc.jpg"],
  "createdAt": "2026-07-24T10:00:00.000Z",
  "progressHistory": [
    { "status": "pending",      "note": "Report received.",           "createdAt": "..." },
    { "status": "under_review", "note": "Verified by field officer.", "createdAt": "..." },
    { "status": "assigned",     "note": "Forwarded to Roads Dept.",   "createdAt": "..." }
  ]
}
```

---

## Project Structure

```
src/
├── app.ts                    # Express app, middleware, routes
├── server.ts                 # Server bootstrap
├── config/index.ts           # Environment config
├── lib/
│   ├── openai.ts             # ChatGPT client (categorize + severity)
│   ├── embedding.ts          # text-embedding-3-small + cosineSimilarity
│   ├── severity.ts           # Severity assessment pipeline
│   ├── cloudinary.ts         # Signed upload helper
│   ├── prisma.ts             # Prisma client
│   └── swagger.ts            # OpenAPI spec
├── middlewares/
│   ├── auth.ts               # JWT role-based auth
│   ├── globalErrorHandler.ts # Centralized error handler
│   ├── validateRequest.ts    # Zod validation wrapper
│   ├── rateLimiter.ts        # Per-route rate limits
│   └── notFound.ts           # 404 handler
├── modules/
│   ├── auth/                 # register, login
│   ├── report/               # CRUD + AI + analytics + tracking + duplicates
│   └── upload/               # Cloudinary signed uploads
├── utils/
│   ├── catchAsync.ts
│   ├── jwt.ts
│   ├── sendResponse.ts
│   └── trackingCode.ts       # CIV-XXXXXX generator
└── __tests__/                # Unit + integration tests (Vitest)
```

---

## Setup & Installation

```bash
git clone https://github.com/AbulBashar38/crisis-desk-backend.git
cd crisis-desk-backend
npm install
cp .env.example .env   # Fill in environment variables
npx prisma generate
npx prisma db push
npm run dev
```

## Environment Variables

```env
# Core
DATABASE_URL=postgresql://user:pass@host:5432/crisisdesk
PORT=8080
APP_URL=http://localhost:3000
PUBLIC_URL=https://your-frontend.example

# Auth
BCRYPT_SALT_ROUNDS=12
JWT_ACCESS_SECRET=your_jwt_secret
JWT_ACCESS_EXPIRES_IN=1d

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# OpenAI (ChatGPT)
OPENAI_API_KEY=sk-...
OPENAI_MODEL_PRIMARY=gpt-4o-mini
OPENAI_MODEL_FALLBACK=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
CLOUDINARY_UPLOAD_PRESET=civic_reports
```

---

## Scripts

```bash
npm run dev    # Development server (tsx watch)
npm start      # Production server (tsx)
npm test       # Run all tests (vitest)
```

---

## Testing

Vitest + Supertest across unit and integration suites:

| Test File | Coverage |
|-----------|----------|
| `embedding.test.ts` | cosineSimilarity math |
| `openai.test.ts` | ChatGPT response parsing, confidence clamping, error handling |
| `auth.service.test.ts` | Register, login, role enforcement |
| `report.service.test.ts` | CRUD, tracking code, duplicate detection, severity |
| `auth.test.ts` (middleware) | Token extraction, role check |
| `jwt.test.ts` | Create, verify, expired, wrong secret |
| `create-report.test.ts` | Validation errors (integration) |

```bash
npm test
```

---

## Acknowledgements

- **OpenAI** — ChatGPT API (`gpt-4o-mini`, `gpt-4o`) and `text-embedding-3-small`.
- **Cloudinary** — image upload, transformation, and delivery.
- **OpenStreetMap** contributors — map tiles (used by the companion frontend).
- **Leaflet** — open-source mapping library (used by the companion frontend).
- **Prisma** + **Neon** — ORM and managed Postgres.
- AI-assisted development tools were used during the build; core architecture and business logic are the team's own work.

---

## Deliverables

- [x] Public GitHub repository
- [x] Live deployed backend
- [x] Swagger / OpenAPI documentation
- [x] Modular, well-typed backend with persistent DB
- [x] Public progress tracking (no PII)
- [x] Cloudinary image upload integration
- [x] ChatGPT-powered categorization + severity + duplicate detection
- [x] Vitest unit + integration tests


