# CivicDesk AI — Hackathon Alignment & Rebuild Spec

> **Competition:** AI & API Hackathon 2026 — First Edition
> **Organizer:** IEEE Computer Society — SEU Student Branch Chapter
> **Audience:** Citizens reporting public-infrastructure issues + Government officials managing them
> **Stack decision (this iteration):** Node.js + Express + TypeScript + PostgreSQL + Prisma, **OpenAI ChatGPT** for AI, **Cloudinary** for image storage.

---

## 1. Product Vision

A two-sided civic infrastructure platform that turns unstructured citizen reports (potholes, broken streetlights, water leaks, illegal dumping) into **structured, prioritized, trackable work items** for government departments — with **AI embedded in the loop**, not bolted on.

---

## 2. Technology Decisions

| Concern | Decision | Notes |
|---|---|---|
| Backend runtime | Node.js + Express 5 + TypeScript | Reuse existing stack |
| Database | PostgreSQL (Neon) + Prisma | Already in place |
| AI model | **OpenAI ChatGPT** (`gpt-4o-mini` primary, `gpt-4o` fallback) | Replaces Gemini |
| Embeddings | `text-embedding-3-small` (OpenAI) for duplicate detection | Replaces bge-m3 |
| Image storage | **Cloudinary** (unsigned uploads from frontend, signed uploads from backend) | Direct citizen photo upload |
| Auth | JWT + bcryptjs (admin only) | Already in place |
| Validation | Zod | Already in place |
| Docs | Swagger (OpenAPI 3) | Already in place |
| Testing | Vitest + Supertest | Already in place |
| Frontend | Next.js 15 + Tailwind + shadcn/ui (separate app) | Not in this repo |
| Mapping | Leaflet + OpenStreetMap (free, no API key) | Bonus feature |
| Notifications | Email via Resend (optional, bonus) | Future |

### Environment variables to add
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL_PRIMARY=gpt-4o-mini
OPENAI_MODEL_FALLBACK=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
CLOUDINARY_UPLOAD_PRESET=civic_reports
```

---

## 3. Domain Model (Rebuild)

### 3.1 Enums

```prisma
enum Role {
  user
  admin
}

enum Language {
  bn
  en
  unknown
}

enum ReportCategory {
  pothole
  broken_streetlight
  water_leak
  illegal_dumping
  other
}

enum SeverityLevel {
  low
  medium
  high
  critical
}

enum ReportStatus {
  pending
  under_review
  assigned
  in_progress
  resolved
  rejected
}

enum Department {
  roads_and_highways
  electrical
  water_and_sewerage
  waste_management
  general
}

enum ProgressVisibility {
  public       // shown on tracking page
  internal     // admin-only
}
```

### 3.2 Report model

```prisma
model Report {
  id                 String         @id @default(uuid())
  trackingCode       String         @unique              // e.g. CIV-7K2P9X
  citizenName        String?        @db.VarChar(255)
  contact            String?        @db.VarChar(255)
  description        String
  locationText       String                            // free-text from citizen
  latitude           Float?
  longitude          Float?
  category           ReportCategory                   // citizen-selected
  aiCategory         ReportCategory?                  // AI-validated
  severityLevel      SeverityLevel?
  severityScore      Float?                           // 0..1
  severityRationale  String?                          // explainability
  summary            String?                          // citizen-language
  canonicalSummary   String?                          // English
  language           Language        @default(unknown)
  normalizedLocation String?
  aiConfidence       Float?
  embedding          Float[]
  imageUrls          String[]                        // Cloudinary URLs
  status             ReportStatus    @default(pending)
  assignedDepartment Department?
  duplicateOfId      String?
  duplicateScore     Float?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  progressUpdates    ProgressUpdate[]
  duplicateChildren  Report[]        @relation("DuplicateLink")
  duplicateParent    Report?         @relation("DuplicateLink", fields: [duplicateOfId], references: [id])

  @@index([status, severityLevel])
  @@index([category])
  @@index([assignedDepartment])
  @@index([createdAt])
  @@index([trackingCode])
  @@map("reports")
}

model ProgressUpdate {
  id            String             @id @default(uuid())
  reportId      String
  report        Report             @relation(fields: [reportId], references: [id], onDelete: Cascade)
  status        ReportStatus
  note          String?
  visibility    ProgressVisibility @default(public)
  updatedById   String?
  updatedBy     User?              @relation(fields: [updatedById], references: [id])
  createdAt     DateTime           @default(now())

  @@index([reportId, createdAt])
  @@map("progress_updates")
}

model User {
  id              String          @id @default(uuid())
  name            String          @db.VarChar(255)
  email           String          @unique @db.VarChar(255)
  password        String          @db.VarChar(255)
  role            Role            @default(admin)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  progressUpdates ProgressUpdate[]

  @@map("users")
}
```

---

## 4. AI Layer (ChatGPT)

### 4.1 Categorization + Summarization

Single structured-output call returning:

```ts
interface ICategoryAnalysis {
  validatedCategory: ReportCategory;
  summary: string;                  // citizen language
  canonicalSummary: string;         // English
  normalizedLocation: string;       // English
  confidence: number;               // 0..1
}
```

**Prompt strategy:**
- System: "You are a civic-infrastructure triage assistant for Bangladesh government departments."
- Tools: `json_schema` (OpenAI Structured Outputs) enforces the schema above.
- Categories are the exact enum values; location normalization includes transliteration from Bangla → English.

### 4.2 Severity Assessment

Second structured-output call:

```ts
interface ISeverityAssessment {
  level: SeverityLevel;
  score: number;                    // 0..1
  rationale: string;                // 2-3 sentences explaining drivers
}
```

**Prompt drivers:** public safety risk, service impact scale, immediate danger, proximity to sensitive areas (school, hospital, main road), time-of-day, weather context.

### 4.3 Embeddings for Duplicate Detection

```ts
const embeddingInput = [
  `Category: ${aiResult.validatedCategory}`,
  `Location: ${aiResult.normalizedLocation}`,
  `Summary: ${aiResult.canonicalSummary}`,
].join("\n");
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: embeddingInput,
});
```

---

## 5. Duplicate Detection

Factors combined with weighted score:

| Factor | Weight | Method |
|---|---|---|
| Semantic similarity | 0.55 | Cosine on `text-embedding-3-small` |
| Category match | 0.15 | Exact enum equality |
| Geographic proximity | 0.20 | Haversine distance < 500 m |
| Time proximity | 0.10 | Within last 7 days |

**Duplicate threshold:** combined score ≥ **0.80** → `possibleDuplicate = true`, `duplicateOfId` linked.

**Behavior:** duplicates are **never blocked**. They are saved, linked to a parent, and surfaced as "Possible duplicate of CIV-XXXX" in the admin dashboard.

---

## 6. Cloudinary Integration

### 6.1 Upload flow

**Option A (recommended) — unsigned upload from frontend:**
1. Frontend uploads directly to Cloudinary using `CLOUDINARY_UPLOAD_PRESET`.
2. Backend receives only the returned `secure_url` in `imageUrls[]`.

**Option B — signed upload through backend:**
1. Frontend requests `POST /api/uploads/sign` → returns `{ signature, timestamp, folder }`.
2. Frontend uploads to Cloudinary using signature.
3. Backend stores resulting URLs.

### 6.2 Image storage rules

- Folder: `civic-reports/{trackingCode}/`
- Transformations on upload: `q_auto,f_auto,w_1600` (auto-format, auto-quality, max width 1600px)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 10 MB per image, max 5 images per report

### 6.3 Optional AI image analysis (bonus)

Send each uploaded image to ChatGPT Vision (`gpt-4o-mini`) with the citizen description and ask it to confirm or correct the category. Result is stored as `aiCategory` and merged with text analysis.

---

## 7. API Surface

### 7.1 Public endpoints (no auth)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/reports` | Submit a new report (multipart JSON with `imageUrls[]`) |
| GET | `/api/reports/track/:trackingCode` | Public tracking view (no PII) |
| POST | `/api/uploads/sign` | (optional) get Cloudinary signature |
| GET | `/api/health` | Health check |

### 7.2 Admin endpoints (JWT, role = admin)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Bootstrap admin (gated by env flag in prod) |
| POST | `/api/auth/login` | Admin login |
| GET | `/api/reports` | List + filter + search + paginate |
| GET | `/api/reports/:id` | Full report detail (admin) |
| PATCH | `/api/reports/:id/assign` | Assign department + status |
| POST | `/api/reports/:id/progress` | Add progress update (status + note + visibility) |
| GET | `/api/reports/:id/duplicates` | List all reports marked as duplicates of this one |
| GET | `/api/reports/stats/summary` | Dashboard analytics |
| DELETE | `/api/reports/:id` | Soft-delete (sets status = rejected) |

### 7.3 Request/response shapes

**`POST /api/reports`** body:
```json
{
  "name": "Rahim Uddin",
  "contact": "+8801711000000",
  "description": "Large pothole near the school crossing, dangerous for kids.",
  "locationText": "Mirpur 10, Dhaka",
  "latitude": 23.8069,
  "longitude": 90.3687,
  "category": "pothole",
  "language": "en",
  "imageUrls": [
    "https://res.cloudinary.com/xxx/image/upload/v123/civic-reports/CIV-7K2P9X/abc.jpg"
  ]
}
```

**`GET /api/reports/track/:trackingCode`** response (PII redacted):
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
  "imageUrls": ["..."],
  "createdAt": "2026-07-24T10:00:00.000Z",
  "progressHistory": [
    { "status": "pending",      "note": "Report received.",            "createdAt": "..." },
    { "status": "under_review", "note": "Verified by field officer.",  "createdAt": "..." },
    { "status": "assigned",     "note": "Forwarded to Roads Dept.",    "createdAt": "..." }
  ]
}
```

---

## 8. Submission Flow (end-to-end)

1. Citizen fills form on `/report` and uploads photos to Cloudinary directly.
2. Frontend `POST /api/reports` with `imageUrls[]`.
3. Backend validates with Zod.
4. **Call 1 — ChatGPT categorization**: validates category, generates summary, normalized location, confidence.
5. **Call 2 — ChatGPT severity**: returns level + score + rationale.
6. Generate embedding with `text-embedding-3-small`.
7. **Duplicate detection**: filter candidates by category + last 7 days + ≤500 m radius; compute combined score; set `duplicateOfId` if ≥0.80.
8. Generate tracking code `CIV-XXXXXX`.
9. Persist report + initial `ProgressUpdate` (status=pending, note="Report received", visibility=public).
10. Return report to frontend (with `trackingCode`).
11. Frontend navigates to `/report/success?code=CIV-XXXXXX`.

---

## 9. Government Dashboard Data

`GET /api/reports/stats/summary` returns:

```json
{
  "totalReports": 1247,
  "pendingReports": 312,
  "criticalReports": 48,
  "resolvedReports": 780,
  "categoryBreakdown": { "pothole": 412, "broken_streetlight": 198, ... },
  "severityBreakdown": { "low": 230, "medium": 510, "high": 380, "critical": 127 },
  "departmentBreakdown": { "roads_and_highways": 412, ... },
  "statusBreakdown": { "pending": 312, "under_review": 88, ... },
  "averageResolutionTimeHours": 41.5,
  "last7Days": [{ "date": "2026-07-18", "count": 22 }, ...]
}
```

---

## 10. Progress Tracking System

- Every status change creates a `ProgressUpdate` row (auto-generated on assignment, manual on progress notes).
- `visibility = public` → shown to citizen via tracking page.
- `visibility = internal` → admin-only.
- `note` is free-text, optional.
- Dashboard shows progress log inline on report detail.

---

## 11. Required Screens (frontend, not in this repo)

| Screen | Route | Purpose |
|---|---|---|
| Citizen Report Submission | `/report` | Form with map pin, category select, photo upload, contact (optional) |
| Submission Success | `/report/success?code=...` | Tracking code, copy button, deep link |
| Public Tracking | `/track/[code]` | Status, severity, department, progress history (no PII) |
| Admin Login | `/admin/login` | JWT login |
| Government Dashboard | `/admin` | Stats cards, filterable table |
| Report Details | `/admin/reports/[id]` | Full info, AI panel, progress log, assign department, update status |

---

## 12. Mandatory Core Requirements Checklist

- [x] Citizen Reporting Portal (description, location, optional contact, optional photo)
- [x] Unique tracking code generated
- [x] AI categorization + structured summary + confidence
- [x] Severity level + score + rationale
- [x] Duplicate detection (semantic + category + geo + time)
- [x] Government dashboard with filters + search
- [x] Assign to department + status updates + progress notes
- [x] Public tracking via code (no PII)
- [x] Persistent database with progress history + duplicate links
- [x] External integrations: **Cloudinary** + **OpenAI ChatGPT** + **OpenStreetMap**
- [x] Responsive UI
- [x] Input validation (client + server)
- [x] Clean error handling

## 13. Bonus Features (pick what fits time-box)

- [ ] Interactive map of all reports (Leaflet + OSM, clustered markers)
- [ ] Image-based AI analysis (GPT-4o Vision to confirm category)
- [ ] Multilingual UI (Bangla + English via `next-intl`)
- [ ] Smart department recommendation (GPT suggests department from description)
- [ ] AI-generated resolution suggestions (GPT drafts next action)
- [ ] Email notifications via Resend on status change
- [ ] Real-time dashboard updates via SSE
- [ ] PWA / offline-first report drafting

---

## 14. Files To Change In This Repo

| File | Change |
|---|---|
| `prisma/schema/enums.prisma` | Replace enums (categories, severity, status, department, progress visibility) |
| `prisma/schema/report.prisma` | Rewrite Report + add ProgressUpdate |
| `prisma/schema/user.prisma` | Add `progressUpdates` back-relation |
| `prisma/migrations/...` | New migration |
| `src/lib/openai.ts` | New ChatGPT client (replace `gemini.ts`) |
| `src/lib/severity.ts` | New severity module |
| `src/lib/cloudinary.ts` | New Cloudinary helper |
| `src/lib/embedding.ts` | Switch to OpenAI `text-embedding-3-small` |
| `src/modules/report/report.service.ts` | Tracking code, severity call, duplicate combined score, progress update creation |
| `src/modules/report/report.validation.ts` | New schema (images, coords, category) |
| `src/modules/report/report.controller.ts` | New endpoints (track, assign, progress, duplicates) |
| `src/modules/report/report.routes.ts` | Wire new routes + Swagger |
| `src/modules/upload/` | New module: signed upload helper |
| `README.md` | Rewrite to match new product |
| `package.json` | Remove `@google/generative-ai` + `@xenova/transformers`, add `openai`, `cloudinary`, `nanoid` |
| `.env.example` | Add new envs |

---

## 15. Hackathon Compliance Notes

- New public GitHub repo for this iteration (recommended: `civic-desk-backend`).
- All code developed during the on-site hackathon.
- AI tooling (this assistant) acknowledged in README.
- Third-party services credited: **OpenAI**, **Cloudinary**, **OpenStreetMap** contributors, **Leaflet**.
- Core logic (categorization rules, severity rubric, duplicate scoring weights) is the team's own engineering work.

---

**Owner:** AbulBashar38 — Team IEEE-CS-SEU
**Last updated:** 2026-07-24