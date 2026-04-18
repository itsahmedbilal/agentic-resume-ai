# Agentic Resume AI — PRD + SRS Hybrid

> **Version:** 3.1.0 · **Date:** April 18, 2026 · **Status:** Finalized
> **Classification:** Internal — Single-User Personal Tool

---

## 1. Overview

### 1.1 Purpose of the System

Agentic Resume AI is a self-hosted, CLI/API-driven backend system that transforms a single master profile into a tailored, ATS-optimized, single-page PDF resume — aligned to any job description submitted at runtime.

### 1.2 Problem Statement

Modern ATS platforms (deployed by 97.8% of Fortune 500 companies) reject qualified candidates not due to lack of skill, but due to:

- Lexical mismatch: "React" submitted when JD requires "React.js"
- Keyword context failure: skills listed in a section footer score lower than skills embedded in achievement bullets
- Structural failures: multi-column layouts cause parsers to scramble text, triggering automatic rejection
- Generic bullets: duty-based statements ("Responsible for managing...") fail both ATS scoring and the 6–15 second human scan window

The user is a full-stack developer with genuine cross-framework competency (Angular, React, Vue on frontend; Node.js, NestJS, .NET on backend) who also leverages AI tooling to accelerate delivery across unfamiliar stacks. Standard resume tools cannot represent this adaptability honestly without manual rework per application.

### 1.3 High-Level Solution Summary

The system maintains one master `profile.json` where every bullet is stored at the **concept level** with per-framework **variants**. At generation time, the pipeline:

1. Receives a raw job description
2. Detects the target persona (role type + primary tech stack)
3. Selects the most relevant bullet variant per concept
4. Rewrites and validates bullets against four quality gates
5. Renders a single-page, ATS-safe PDF with exact JD terminology embedded in context

The result: every resume looks purpose-built for that role — while remaining 100% factually honest.

---

## 2. Goals & Success Metrics

### 2.1 Business Goals

| # | Goal |
|---|------|
| G-01 | Maximize ATS keyword coverage score for every submitted JD |
| G-02 | Reduce per-application resume tailoring time from ~45 min to <2 min |
| G-03 | Ensure zero hallucinated skills or fabricated experience appear in output |
| G-04 | Produce ATS-parseable PDFs that pass machine extraction and human review |
| G-05 | Accumulate cross-run learning to improve output quality over time |

### 2.2 KPIs (Quantifiable Metrics)

| Metric | Target | Measured By |
|--------|--------|-------------|
| Keyword Coverage % | ≥ 70% of JD required skills appear in bullet text | `metadata.keywordCoveragePct` |
| Bullet Gate Pass Rate | ≥ 85% of rewrites pass all 4 gates | `metadata.gatePassRate` |
| Confidence Score | ≥ 0.75 per run | `metadata.confidenceScore` |
| PDF Extractable Characters | ≥ 500 chars (ATS compliance floor) | Output Guard validation |
| Page Count | Exactly 1 page | Output Guard validation |
| LLM Calls Per Run | ≤ 10 (via caching) | `costStats.totalCalls` |
| Generation Latency | < 45 seconds end-to-end | `trace.totalDurationMs` |
| Cache Hit Rate | ≥ 40% after 10+ runs | `cacheStats.hitRatio` |
| Low-Fit Warning Rate | < 20% of runs | `metadata.lowFitWarning` |

---

## 3. Stakeholders

### 3.1 Internal Stakeholders

| Role | Involvement |
|------|-------------|
| **System Owner (User)** | Sole operator, profile maintainer, consumer of generated resumes |

### 3.2 External Stakeholders

| Role | Involvement |
|------|-------------|
| **ATS Platforms** | Downstream parsers that consume the generated PDF (Workday, Greenhouse, Lever, Ashby, iCIMS) |
| **Human Recruiters** | Secondary reviewers who conduct 6–15 second visual scans post-ATS |
| **Google Gemini API** | External LLM service providing text generation and semantic embedding |

---

## 4. User Personas

### Persona: The Adaptive Engineer

| Field | Detail |
|-------|--------|
| **Name** | Self (solo user) |
| **Role** | Full-Stack Developer with cross-framework frontend competency + backend depth |
| **Tech Breadth** | Angular, React, Vue (frontend); Node.js, NestJS, Express, .NET (backend); PostgreSQL, MongoDB, Redis (data) |
| **AI Leverage** | Uses GitHub Copilot, Claude, and similar tools to deliver production-quality output across stacks — including unfamiliar ones |
| **Goal** | Submit a different, perfectly-tailored resume for each job application in under 2 minutes |
| **Pain Points** | Manual keyword matching is tedious; one resume fits no job perfectly; framework-specific language differs per JD; ATS rejects otherwise strong candidates on lexical grounds |
| **Insight** | Does not need the system to pretend expertise — the expertise is real. The system's job is **correct framing**, not fabrication |

---

## 5. Functional Requirements

---

### FR-001: Master Profile Loading & Validation

| Field | Detail |
|-------|--------|
| **ID** | FR-001 |
| **Title** | Load and validate master profile on startup |
| **Description** | At application startup, the system reads `data/profile.json`, validates it against the required schema (see §8), and rejects startup if required fields are missing or malformed |
| **Preconditions** | `data/profile.json` exists in the working directory |
| **Flow** | 1. Read file → 2. Parse JSON → 3. Validate schema (required: `name`, `titles[]`, `summary`, `roles[]`, `skills{}`, `projects[]`) → 4. Validate every `achievement` has `variants.generic` at minimum → 5. Log loaded bullet/project count → 6. Throw `ProfileValidationError` on failure |
| **Postconditions** | Profile is available in-memory for all pipeline runs |
| **Edge Cases** | File missing → startup failure with clear error; JSON malformed → parse error surfaced; bullet missing `variants.generic` → validation error with bullet ID |

---

### FR-002: Input Sanitization & Security Guard

| Field | Detail |
|-------|--------|
| **ID** | FR-002 |
| **Title** | Sanitize and validate incoming JD text |
| **Description** | Every JD string submitted to `POST /api/v1/generate-resume` is screened by the Input Guard before entering the pipeline |
| **Preconditions** | Request received with `{ jdText: string }` |
| **Flow** | 1. Check length (max 10,000 chars) → 2. Scan for high-severity patterns (prompt injection, role override, system tokens, jailbreak keywords, null bytes) → 3. Scan for medium-severity patterns (encoding anomalies, excessive repetition) → 4. High-severity → `400 Bad Request` with `securityBlock: true` → 5. Medium-severity → sanitize and continue with `sanitizationApplied: true` in trace |
| **Postconditions** | Only clean JD text enters the pipeline |
| **Edge Cases** | Empty string → `400`; whitespace-only → `400`; JD > 10,000 chars → medium-severity, truncated at 10,000; Unicode normalization applied before scanning |

**Threat Table:**

| Pattern | Severity | Response |
|---------|----------|----------|
| "Ignore all previous instructions" | High | Block, 400 |
| Role override attempts | Medium | Sanitize, log |
| System token injection (`[INST]`, `<\|im_start\|>`) | High | Block, 400 |
| Jailbreak keywords ("DAN", "jailbreak") | High | Block, 400 |
| Null byte (`\x00`) | High | Block, 400 |
| JD length > 10,000 chars | Medium | Truncate, log |

---

### FR-003: Query Rewriting & Skill Normalization

| Field | Detail |
|-------|--------|
| **ID** | FR-003 |
| **Title** | Normalize and expand JD terminology |
| **Description** | The Query Rewriter (zero-LLM, rule-based) normalizes JD text and expands skill synonyms to maximize downstream matching |
| **Preconditions** | Sanitized JD text available |
| **Flow** | 1. Normalize casing → 2. Expand synonyms (e.g., "React.js" → ["React", "ReactJS", "React.js"]; "Nodejs" → ["Node.js", "Node"]) → 3. Detect domain signals (fintech, SaaS, e-commerce, healthcare) → 4. Assess JD complexity (token count + skill count + seniority signals) → 5. Output: `{ expandedSkills[], domain, complexity: "low"/"medium"/"high" }` |
| **Postconditions** | Expanded skill set and domain available for routing and extraction |
| **Edge Cases** | No recognizable skills → proceed with raw text; unknown domain → `domain: "general"`; duplicate synonyms de-duplicated |

---

### FR-004: Persona Detection

| Field | Detail |
|-------|--------|
| **ID** | FR-004 |
| **Title** | Classify JD into a role persona and primary tech stack |
| **Description** | After JD extraction (FR-006), the system classifies the target role into a persona that drives all downstream bullet selection, variant picking, and title generation |
| **Preconditions** | JD extraction result available (required skills, seniority, domain) |
| **Flow** | 1. Match extracted skills against persona taxonomy → 2. Score each persona by skill overlap → 3. Select top persona → 4. Determine `isFullstack` flag (if both frontend + backend skills ≥ 3 each) → 5. Output persona object |
| **Postconditions** | Persona object injected into pipeline context |
| **Edge Cases** | No clear persona match → `persona: "generic"`, all variants use `generic` fallback; conflicting signals (equal frontend/backend) → `fullstack` persona |

**Persona Taxonomy:**

| Persona ID | Signals | Primary Stack Indicators |
|------------|---------|--------------------------|
| `frontend-angular` | Angular, RxJS, NgRx, Angular Material | Angular, TypeScript, RxJS |
| `frontend-react` | React, Next.js, Redux, React Native | React, Next.js, TypeScript |
| `frontend-vue` | Vue, Nuxt, Pinia, Vuex | Vue 3, Nuxt, TypeScript |
| `frontend-generic` | HTML, CSS, frontend (no framework signal) | TypeScript, Webpack, Vite |
| `backend-node` | Node.js, NestJS, Express, Fastify | Node.js, NestJS, PostgreSQL |
| `backend-dotnet` | C#, .NET, ASP.NET, Azure | .NET, C#, Azure |
| `backend-python` | Python, FastAPI, Django, Flask | Python, FastAPI, PostgreSQL |
| `fullstack` | ≥3 frontend + ≥3 backend skills | Balanced mix |
| `devops` | Docker, Kubernetes, CI/CD, Terraform | Docker, K8s, GitHub Actions |
| `generic` | No dominant signal | Falls back to `generic` variant |

---

### FR-005: Adaptive Strategy Selection

| Field | Detail |
|-------|--------|
| **ID** | FR-005 |
| **Title** | Select processing strategy based on JD complexity and domain history |
| **Description** | The system dynamically selects a pipeline strategy (fast/standard/deep) using JD complexity, profile size, and episodic memory from past runs |
| **Preconditions** | Query rewrite result and persona available; episodic memory accessible |
| **Flow** | 1. Base strategy from complexity: `low` → `fast`, `medium` → `standard`, `high` → `deep` → 2. Query episodic memory for matching domain + persona → 3. If ≥3 historical runs exist for this domain+persona, override with `bestStrategy` from history → 4. Apply signal overrides (see table) → 5. Emit `lowFitWarning` if profile skill coverage < 30% of JD requirements |
| **Postconditions** | Strategy object (`topN`, `maxBulletsPerRole`, `retries`, `disableMerge`) injected into pipeline |
| **Edge Cases** | No episodic memory → use base strategy; conflicting signals → most conservative (deeper) strategy wins |

**Strategy Parameters:**

| Strategy | topN | maxBulletsPerRole | Retries | Merge |
|----------|------|-------------------|---------|-------|
| `fast` | 6 | 3 | 0 | On |
| `standard` | 8 | 4 | 0 | On |
| `deep` | 10 | 5 | 1 | On |

**Override Signals:**

| Signal | Override Action |
|--------|-----------------|
| Domain+persona memory coverage < 50% | Escalate to `deep` |
| Profile total bullets < 10 | Reduce `topN` by 2, set `disableMerge: true` |
| Persona switches vs last run | Ignore episodic memory from prior persona |
| `isFullstack: true` | Enforce 50/50 domain bullet split |

---

### FR-006: JD Extraction (LLM)

| Field | Detail |
|-------|--------|
| **ID** | FR-006 |
| **Title** | Extract structured requirements from raw JD via Gemini |
| **Description** | Gemini is called with the sanitized JD to extract a structured requirements object |
| **Preconditions** | Sanitized JD text; Gemini API key configured; semantic cache checked |
| **Flow** | 1. Compute SHA-256 hash of prompt → 2. Check semantic cache → 3. Cache hit → return cached extraction → 4. Cache miss → call `gemini-2.0-flash-001` with JD extraction prompt → 5. Parse response → 6. Store in cache → 7. Return extraction |
| **Postconditions** | Structured extraction available: `{ requiredSkills[], preferredSkills[], seniority, domain, companyContext, culturalSignals[] }` |
| **Edge Cases** | Gemini 429 → `AF-02`; malformed response → retry once → fail with `500`; empty skills array → flag `lowFitWarning` |

---

### FR-007: Bullet Variant Selection & Document Grading

| Field | Detail |
|-------|--------|
| **ID** | FR-007 |
| **Title** | Grade and rank profile bullets using persona-aware scoring |
| **Description** | Each achievement in the master profile is scored against the JD. The persona multiplier biases scores toward domain-relevant bullets. For each bullet, the correct variant is selected before scoring |
| **Preconditions** | JD extraction result; persona object; strategy `topN` value |
| **Flow** | 1. For each achievement: select variant (persona-matched > generic) → 2. Compute embedding for variant text and JD requirements → 3. Score: `(cosineSimilarity × 0.5) + (techOverlap × 0.3) + (personaMatch × 0.2)` → 4. Sort by score descending → 5. Take top `topN` bullets → 6. Self-correct if score distribution is suspiciously uniform (σ < 0.05) → re-weight with stronger techOverlap emphasis |
| **Postconditions** | Ranked list of `{ bulletId, selectedVariant, score, techOverlap[] }` |
| **Edge Cases** | All bullets below 0.3 score → emit `lowFitWarning`; fewer bullets than `topN` → use all available; variant missing for persona → fall back to `generic` |

**Persona Match Scoring:**

| Condition | Score |
|-----------|-------|
| Bullet domain == persona primary domain | +0.4 |
| Bullet domain == `meta` (AI productivity) | +0.2 (always relevant) |
| Bullet is `fullstack` persona, mixed domain | +0.0 (neutral) |
| Bullet domain conflicts with persona | −0.3 |

**Variant Selection Priority:**
```
persona-specific variant → generic variant → (never skip bullet entirely due to missing variant)
```

---

### FR-008: Bullet Merge

| Field | Detail |
|-------|--------|
| **ID** | FR-008 |
| **Title** | Merge overlapping bullets within a role to fit maxBulletsPerRole |
| **Description** | If a role has more selected bullets than `maxBulletsPerRole`, semantically similar bullets are merged into a single compound bullet before rewriting |
| **Preconditions** | Graded bullets for each role; strategy `maxBulletsPerRole` |
| **Flow** | 1. Group selected bullets by role → 2. If count > `maxBulletsPerRole`: identify pairs with cosine similarity > 0.75 → 3. Merge pair into combined text → 4. Flag merged bullet for rewrite → 5. Validate merged text retains both tech mentions → 6. Warning if critical tech lost in merge |
| **Postconditions** | Each role has ≤ `maxBulletsPerRole` bullets ready for rewriting |
| **Edge Cases** | `disableMerge: true` → skip; no high-similarity pairs → drop lowest-scoring bullet instead |

---

### FR-009: Bullet Rewrite (LLM)

| Field | Detail |
|-------|--------|
| **ID** | FR-009 |
| **Title** | Rewrite each selected bullet variant via Gemini with JD context |
| **Description** | Each selected bullet variant is rewritten by Gemini to embed JD-exact terminology, maintain XYZ formula structure, and maximize ATS keyword density without stuffing |
| **Preconditions** | Selected bullet variant text; JD extraction result; few-shot examples from memory store (if available) |
| **Flow** | 1. Check semantic cache (hash of bullet+JD context) → 2. Cache hit → use cached rewrite → 3. Miss → call Gemini with rewrite prompt (includes few-shot examples, XYZ formula instruction, JD required skills, persona context) → 4. Parse rewrite → 5. Run FR-010 (4-gate validation) → 6. Pass → store in cache + memory → 7. Fail → use original variant text, increment `flaggedCount` |
| **Postconditions** | Each bullet has a final text: either validated rewrite or fallback original |
| **Edge Cases** | Gemini returns empty string → fallback to original; rewrite identical to original → accept (no hallucination risk); `retries: 1` in `deep` strategy → one retry with stricter prompt before fallback |

**Rewrite Prompt Constraints Injected:**
- Start with a strong action verb (Architected, Engineered, Optimized, Delivered, etc.)
- Embed ≥1 required skill from JD using its exact JD phrasing (e.g., "React.js" not "React")
- Spell out acronyms on first use (e.g., "Amazon Web Services (AWS)")
- ≤ 170 characters
- No first-person pronouns
- XYZ formula: Accomplished [X] measured by [Y] by doing [Z]
- Preserve all numerical metrics from original bullet

---

### FR-010: Four-Gate Bullet Validation (Content Guard)

| Field | Detail |
|-------|--------|
| **ID** | FR-010 |
| **Title** | Validate each rewritten bullet through four quality gates |
| **Description** | Every rewritten bullet must pass all four gates before replacing the selected variant |
| **Preconditions** | Original variant text; rewritten bullet text; JD required skills; profile tech term list |
| **Flow** | Run all 4 gates in sequence; any failure → immediate fallback to original |
| **Postconditions** | Bullet accepted with confidence score, or rejected with fallback + `flaggedCount++` |
| **Edge Cases** | Gate 3 zero-tolerance — one hallucinated term = immediate fail regardless of other gate scores |

**Validation Gates:**

| Gate | Name | Rule | Threshold |
|------|------|------|-----------|
| Gate 1 | Semantic Fidelity | Jaccard similarity between original variant and rewrite | ≥ 0.55 |
| Gate 2 | Keyword Coverage | ≥ 1 JD required skill present in rewrite (exact or synonym match) | ≥ 1 skill |
| Gate 3 | Hallucination Detection | All capitalized tech terms in rewrite must exist in: original text OR profile `techTags` OR JD skills | 0 hallucinated terms |
| Gate 4 | Structural Rules | Starts with action verb; ≤ 170 chars; no first-person pronouns ("I", "my", "we") | All 3 pass |

**Confidence Score Formula:**
```
confidence = (0.5 × fidelityScore) + (0.3 × keywordScore) + (0.2 × structureScore)

Note: Gate 3 (hallucination) is binary — any hallucinated term triggers immediate rejection
before confidence is computed. Gate 3 does not contribute a weighted score.
```

---

### FR-011: Profile Filtering & Assembly

| Field | Detail |
|-------|--------|
| **ID** | FR-011 |
| **Title** | Assemble a filtered profile using validated bullets |
| **Description** | Clone the master profile and replace achievements with validated rewrites; filter projects by persona relevance |
| **Preconditions** | All bullets finalized (rewritten or fallback); persona object; strategy `maxProjects` |
| **Flow** | 1. Clone master profile → 2. Replace each role's bullets with finalized list → 3. Score each project: persona-matched `techTags` get +0.3 boost → 4. Sort projects by score → 5. Take top `maxProjects` → 6. Select `title` from `profile.titles[]` based on persona → 7. Output filtered profile |
| **Postconditions** | `filteredProfile` object ready for summary rewrite and PDF generation |
| **Edge Cases** | No projects match persona → include top 2 by score regardless; role with 0 passing bullets → include role with original bullets flagged |

**Dynamic Title Selection:**

| Persona | Title Selected |
|---------|---------------|
| `frontend-angular` | "Frontend Developer — Angular & TypeScript" |
| `frontend-react` | "Frontend Developer — React & Next.js" |
| `frontend-vue` | "Frontend Developer — Vue 3 & TypeScript" |
| `backend-node` | "Backend Engineer — Node.js & NestJS" |
| `backend-dotnet` | "Backend Engineer — .NET & Azure" |
| `fullstack` | "Full Stack Engineer" |
| `devops` | "DevOps & Cloud Engineer" |
| `generic` | First entry in `profile.titles[]` |

---

### FR-012: Professional Summary Rewrite (LLM)

| Field | Detail |
|-------|--------|
| **ID** | FR-012 |
| **Title** | Rewrite the professional summary for the target role |
| **Description** | The base summary is rewritten by Gemini to align with the detected persona's seniority, domain, and company context. Must be specific — not generic |
| **Preconditions** | Base summary; JD extraction result; persona object |
| **Flow** | 1. Check cache (hash of summary+persona+seniority) → 2. Miss → call Gemini with summary rewrite prompt → 3. Validate: ≥ 2 JD keywords present; ≤ 4 lines; no "hard-working professional" or similarly generic openers → 4. Cache and return |
| **Postconditions** | Tailored summary injected into `filteredProfile` |
| **Edge Cases** | Rewrite fails validation → use base summary with keyword injection fallback |

---

### FR-013: PDF Generation

| Field | Detail |
|-------|--------|
| **ID** | FR-013 |
| **Title** | Render filtered profile to ATS-compliant single-page PDF |
| **Description** | Puppeteer renders the Handlebars-compiled HTML template to PDF. Strict ATS formatting rules are enforced at template level |
| **Preconditions** | `filteredProfile` assembled; Handlebars template available |
| **Flow** | 1. Compile Handlebars template with `filteredProfile` → 2. Launch Puppeteer → 3. Render HTML → 4. Export PDF with settings: no print headers/footers, Letter size, 0.4in margins → 5. Save to `output/resumes/resume_{runId}.pdf` |
| **Postconditions** | PDF file saved; passed to Output Guard (FR-014) |
| **Edge Cases** | Puppeteer crash → `500` with trace; content overflow beyond 1 page → Output Guard rejects → reduce `maxBulletsPerRole` by 1 and retry once |

**ATS Template Rules (Non-Negotiable):**
- Single-column layout only — no multi-column, no text boxes, no tables for layout
- Fonts: Arial or Calibri (sans-serif, Unicode-safe)
- Section headers: exact orthodox names — "Work Experience", "Education", "Projects", "Technical Skills"
- Contact info in main body plain text — never in HTML header/footer elements
- Dates formatted as MM/YYYY
- No images, icons, or graphic elements
- No hyperlinks styled as colored text (plain underline only)
- Skills section: grouped by category (Frontend, Backend, Database, DevOps, Tools)

---

### FR-014: Output Guard Validation

| Field | Detail |
|-------|--------|
| **ID** | FR-014 |
| **Title** | Validate generated PDF for ATS compliance |
| **Description** | The Output Guard verifies the PDF meets all ATS and quality thresholds before the response is returned |
| **Preconditions** | PDF file exists at expected path |
| **Flow** | 1. Verify file exists and size > 0 → 2. Extract text → verify ≥ 500 extractable characters → 3. Count pages → verify == 1 → 4. Verify metadata fields present (runId, generatedAt) → 5. Check keyword coverage ≥ configured threshold → 6. Check confidence score ≥ 0.65 → 7. All pass → approve; any fail → reject with specific failure code |
| **Postconditions** | PDF approved or pipeline fails with specific guard error code |
| **Edge Cases** | < 500 chars extracted → ATS compliance failure; > 1 page → overflow failure → trigger single retry with reduced bullets; keyword coverage < threshold → warn but do not block (log `lowCoverageWarning`) |

---

### FR-015: Cross-Run Memory Persistence

| Field | Detail |
|-------|--------|
| **ID** | FR-015 |
| **Title** | Save run outcome and high-confidence examples to memory |
| **Description** | At the end of every successful run, the system persists two types of data for future improvement |
| **Preconditions** | Run completed; output approved by Output Guard |
| **Flow** | 1. Persist `EpisodicMemory` entry: `{ domain, persona, strategy, keywordCoverage, confidenceScore, gatePassRate, latencyMs, llmCalls }` → 2. For each bullet where `confidence ≥ 0.90` AND all gates passed → persist `ExampleStore` entry: `{ originalVariant, rewrittenText, persona, jdSkills[], confidence }` → 3. Trim ExampleStore to 200 most recent entries per persona |
| **Postconditions** | Memory updated; available for next run's strategy selection and few-shot injection |
| **Edge Cases** | MongoDB write failure → log warning, do not fail the run; ExampleStore > 200 entries per persona → evict lowest-confidence entry using `findOneAndDelete` sorted by `confidence` ascending |

---

### FR-016: Semantic Cache

| Field | Detail |
|-------|--------|
| **ID** | FR-016 |
| **Title** | Cache LLM responses by prompt hash to eliminate redundant API calls |
| **Description** | Before every Gemini call, a SHA-256 hash of the prompt is checked against MongoDB. On hit, the cached response is returned instantly |
| **Preconditions** | MongoDB `semantic_cache` collection initialized with a unique index on `promptHash` |
| **Flow** | 1. Hash prompt string → 2. Lookup in cache table → 3. Hit → return `cachedResponse`, update `hitCount` and `lastHitAt` → 4. Miss → execute Gemini call → store response with hash, confidence, timestamp |
| **Postconditions** | LLM call either served from cache or executed and cached |
| **Edge Cases** | MongoDB unreachable → bypass cache, execute call directly, log warning; cache entry older than 30 days → treat as miss (stale prompts may have evolved); duplicate `promptHash` insert → upsert, do not throw |

---

### FR-017: Submit User Feedback

| Field | Detail |
|-------|--------|
| **ID** | FR-017 |
| **Title** | Record subjective quality feedback for a completed run |
| **Description** | The user submits a 1–5 rating and optional notes/changed bullets after reviewing the generated resume |
| **Preconditions** | Valid `runId` exists in run history |
| **Trigger** | `POST /api/v1/feedback/:runId` |
| **Flow** | 1. Validate `runId` exists → 2. Validate rating (1–5 integer) → 3. Persist feedback entry linked to `runId` → 4. Update quality trend aggregate |
| **Postconditions** | Feedback stored; available in quality trend metrics |
| **Edge Cases** | Duplicate feedback for same `runId` → overwrite; invalid rating → `400`; unknown `runId` → `404` |

---

### FR-018: Offline Evaluation Suite

| Field | Detail |
|-------|--------|
| **ID** | FR-018 |
| **Title** | Batch-run pipeline against golden test cases |
| **Description** | Runs the full pipeline against every entry in `data/golden-dataset.json` and produces a pass/fail report |
| **Preconditions** | Golden dataset has ≥1 test case; profile loaded |
| **Trigger** | `POST /api/v1/eval/run` |
| **Flow** | 1. Load golden dataset → 2. For each test case: run full pipeline → compare output against expected thresholds → 3. Aggregate results → 4. Return `EvalReport` |
| **Postconditions** | `EvalReport` with per-case pass/fail, overall pass rate, average keyword coverage |
| **Edge Cases** | Test case JD blocked by security guard → mark as `skipped`, not `failed`; Gemini quota exhausted mid-eval → partial report with `interrupted: true` |

**Evaluation Criteria:**

| Metric | Pass Condition |
|--------|----------------|
| Keyword Coverage | `actual.keywordCoveragePct ≥ testCase.minKeywordCoverage` |
| Bullet Count | `actual.bulletCount ≥ testCase.expectedMinBullets` |
| Page Count | `actual.pages ≤ testCase.maxPages` (always 1) |
| Skill Presence | All `expectedSkillsCovered` appear in extracted required skills |
| Persona Match | `detectedPersona` matches `testCase.expectedPersona` |

---

### FR-019: System Health & Observability

| Field | Detail |
|-------|--------|
| **ID** | FR-019 |
| **Title** | Expose real-time health, quality trends, and cost metrics |
| **Description** | Three read-only endpoints expose operational visibility into system state |
| **Preconditions** | System running; MongoDB accessible |
| **Endpoints** | `GET /api/v1/health`, `GET /api/v1/observability/quality`, `GET /api/v1/observability/cost`, `GET /api/v1/observability/cost/:runId` |
| **Postconditions** | JSON response with current metrics |
| **Edge Cases** | MongoDB unreachable → `503` with degraded health status |

**Quality Alerts:**

| Alert | Warning Threshold | Critical Threshold |
|-------|-------------------|--------------------|
| `low-coverage` | < 50% avg keyword coverage | < 30% |
| `high-flag-rate` | Gate pass rate < 60% | < 40% |
| `quality-drop` | Confidence trend declining over last 5 runs | — |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target |
|-------------|--------|
| End-to-end generation latency (p95) | < 45 seconds |
| LLM calls per run (with cache) | ≤ 10 |
| PDF render time | < 5 seconds |
| Cache lookup time | < 10ms |
| Zero-LLM agent execution (rewriter, decomposer, router) | < 200ms combined |

### 6.2 Scalability

This is a single-user, single-instance system. Scalability is not a target — cost efficiency is.

| Requirement | Detail |
|-------------|--------|
| Gemini free-tier compliance | RPM throttling at 4 RPM with exponential backoff on 429 |
| MongoDB capacity | Supports 10,000+ documents across all collections without performance degradation; TTL index on `semantic_cache` auto-expires entries older than 30 days |
| Cache effectiveness | SHA-256 keying with unique index ensures identical prompts never hit the API twice; upsert on conflict |

### 6.3 Reliability

| Requirement | Detail |
|-------------|--------|
| Bullet fallback | Any gate failure falls back to original variant — system never crashes on validation failure |
| Gemini retry | 429 errors use exponential backoff (1s → 2s → 4s → give up with 429 response) |
| PDF overflow retry | One automatic retry with reduced `maxBulletsPerRole` before failing |
| DB write failure | Non-blocking — run succeeds even if memory persistence fails |

### 6.4 Security

| Requirement | Detail |
|-------------|--------|
| Prompt injection defense | Input Guard blocks all high-severity patterns before LLM call |
| API key isolation | Gemini API key read from environment variable; never logged or returned in responses |
| No external data exfiltration | Profile data never sent outside of controlled Gemini API calls |
| MongoDB isolation | MongoDB runs locally (localhost:27017); no external network binding; credentials stored in `.env` |

### 6.5 Compliance — ATS Output Standards

| Requirement | Standard |
|-------------|----------|
| Single-column layout | ATS parsers read top-to-bottom, left-to-right; no multi-column |
| Font | Arial or Calibri (Unicode-safe, sans-serif) |
| File format | Clean PDF (not .docx) — preserves formatting across OS; modern ATS parses cleanly |
| Extractable text | ≥ 500 characters verified by Output Guard |
| Section header naming | Orthodox names only ("Work Experience" not "My Journey") |
| Date format | MM/YYYY throughout |
| Acronym expansion | Full term + abbreviation on first use (e.g., "Amazon Web Services (AWS)") |
| No keyword stuffing | Keywords embedded in achievement context, not isolated at bottom |
| Contact info | In main body plain text — never in HTML/PDF header/footer metadata |

### 6.6 Availability

Single-user local system. No uptime SLA required. Gemini API availability is the sole external dependency.

---

## 7. System Architecture (High-Level)

### 7.1 Components

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| API Controller | NestJS Controller | Request intake, response assembly, orchestration |
| Input Guard | NestJS Service (zero-LLM) | Security screening of JD input |
| Query Rewriter | NestJS Service (zero-LLM) | Synonym expansion, domain detection, complexity scoring |
| Persona Detector | NestJS Service (zero-LLM) | Role + stack classification from JD extraction |
| Adaptive Router | NestJS Service (zero-LLM) | Strategy selection using episodic memory |
| JD Extractor | Gemini Service | LLM-based structured extraction of JD requirements |
| Document Grader | Embedding Service | Cosine similarity scoring with persona multiplier |
| Bullet Rewriter | Gemini Service | LLM-based bullet rewriting with few-shot injection |
| Content Guard | NestJS Service (zero-LLM) | Four-gate bullet validation |
| Profile Filter | NestJS Service (zero-LLM) | Persona-aware project and title selection |
| Summary Rewriter | Gemini Service | LLM-based summary personalization |
| PDF Generator | Puppeteer + Handlebars | ATS-compliant PDF rendering |
| Output Guard | NestJS Service | PDF compliance verification |
| Semantic Cache | MongoDB collection + SHA-256 | LLM call deduplication with TTL auto-expiry |
| Memory Service | MongoDB collections (Mongoose) | Episodic memory + example store persistence |
| Trace Service | NestJS Service | Per-stage span tracking |
| Cost Tracker | NestJS Service | Token/call/latency/cost aggregation |
| Feedback Service | NestJS Service | User rating persistence |
| Eval Service | NestJS Service | Golden dataset batch evaluation |

### 7.2 Interaction Flow

```
POST /generate-resume
  → Input Guard
    → Query Rewriter
      → Adaptive Router
        → JD Extraction (Gemini / Cache)
          → Persona Detector
            → Document Grader (Embeddings)
              → Bullet Merge
                → Bullet Rewrite (Gemini / Cache) × N
                  → Content Guard (4 gates) × N
                    → Profile Filter + Title Selector
                      → Summary Rewrite (Gemini / Cache)
                        → PDF Generator (Puppeteer)
                          → Output Guard
                            → Memory Service (persist)
                              → Response
```

### 7.3 External Integrations

| Integration | Purpose | Failure Handling |
|-------------|---------|------------------|
| Google Gemini 2.0 Flash (`gemini-2.0-flash-001`) | Text generation + embeddings | 429 → backoff; 500 → fail run |
| Puppeteer (headless Chrome) | PDF rendering | Crash → 500 |

---

## 8. Data Model (High-Level)

### 8.1 profile.json Schema

```typescript
interface MasterProfile {
  name: string;
  titles: string[];          // Ordered by preference; persona picks one
  summary: string;           // Base summary; gets rewritten per run
  coreConcepts: string[];    // Framework-agnostic skills shown on every resume
  aiProductivity: string;    // AI-leveraged delivery statement; always included

  roles: Role[];
  skills: SkillMap;
  projects: Project[];
  education: Education[];
}

interface Role {
  company: string;
  period: string;            // Format: "MM/YYYY – MM/YYYY" or "MM/YYYY – Present"
  location?: string;
  achievements: Achievement[];
}

interface Achievement {
  id: string;                // e.g., "b001" — unique across entire profile
  concept: string;           // Framework-agnostic description of the accomplishment
  techTags: string[];        // All tech terms this bullet is relevant to
  domain: "frontend" | "backend" | "fullstack" | "devops" | "data" | "meta";
  strength: "primary" | "secondary"; // primary = deep expertise; secondary = supporting
  alwaysInclude?: boolean;   // true for AI productivity bullet
  variants: {
    angular?: string;        // Angular-specific phrasing
    react?: string;          // React-specific phrasing
    vue?: string;            // Vue-specific phrasing
    "backend-node"?: string;
    "backend-dotnet"?: string;
    fullstack?: string;
    generic: string;         // REQUIRED: fallback for unmatched personas
  };
}

interface SkillMap {
  frontend: string[];
  backend: string[];
  database: string[];
  devops: string[];
  tools: string[];
  aiTools: string[];         // e.g., ["GitHub Copilot", "Claude", "Cursor"]
}

interface Project {
  name: string;
  techTags: string[];
  domain: string;
  description: string;
  link?: string;
}
```

### 8.2 MongoDB Collections (Mongoose Schemas)

**Database name:** `agentic_resume_ai`

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `semantic_cache` | LLM call deduplication | `promptHash` (unique index), `response`, `hitCount`, `createdAt` (TTL index: 30d), `lastHitAt` |
| `example_store` | Few-shot injection pool | `persona`, `originalVariant`, `rewrittenText`, `confidence`, `jdSkills[]`, `createdAt`; index on `[persona, confidence]` |
| `episodic_memory` | Adaptive strategy history | `domain`, `persona`, `strategy`, `keywordCoverage`, `confidenceScore`, `gatePassRate`, `latencyMs`, `llmCalls`, `runAt`; index on `[domain, persona]` |
| `run_history` | Run log + feedback linkage | `runId` (unique), `domain`, `persona`, `strategy`, `keywordCoverage`, `confidence`, `pdfPath`, `createdAt` |
| `feedback` | Quality trend analysis | `runId` (ref: `run_history`), `rating` (1–5), `comments`, `bulletsChanged[]`, `submittedAt` |
| `quality_metrics` | Observability aggregates | `runId` (ref: `run_history`), `gatePassRate`, `flaggedCount`, `lowFitWarning`, `confidenceScore` |
| `cost_tracking` | Cost observability | `runId` (ref: `run_history`), `totalCalls`, `inputTokens`, `outputTokens`, `estimatedCostUsd`, `latencyMs` |

**Index Strategy:**

| Collection | Index | Type | Purpose |
|------------|-------|------|---------|
| `semantic_cache` | `promptHash` | Unique | Fast cache lookup, prevent duplicates |
| `semantic_cache` | `createdAt` | TTL (30 days) | Auto-expire stale cache entries |
| `example_store` | `[persona, confidence]` | Compound | Efficient few-shot retrieval per persona |
| `episodic_memory` | `[domain, persona]` | Compound | Strategy lookup per domain+persona pair |
| `run_history` | `runId` | Unique | Primary key for run linkage |
| `run_history` | `createdAt` | Descending | Latest runs first in observability queries |

**Connection:**
```
MONGODB_URI=mongodb://localhost:27017/agentic_resume_ai  # .env — never hardcoded
```

### 8.3 Key Relationships

```
run_history (1) ──→ (1) feedback          [runId ref]
run_history (1) ──→ (1) quality_metrics   [runId ref]
run_history (1) ──→ (1) cost_tracking     [runId ref]
run_history (1) ──→ (N) example_store     [bullets produced in this run]
episodic_memory (N) indexed by [domain + persona] compound index
semantic_cache  (1) per unique promptHash — upsert on collision
```

> All cross-collection references use `runId` (UUID string), not MongoDB `ObjectId`, to keep references human-readable in logs and trace output.

---

## 9. API Contracts

### POST /api/v1/generate-resume

**Request:**
```json
{
  "jdText": "string (required, 1–10000 chars)"
}
```

**Response 200:**
```json
{
  "resumeId": "uuid",
  "pdfPath": "output/resumes/resume_{runId}.pdf",
  "metadata": {
    "persona": "frontend-angular",
    "detectedStack": ["Angular", "TypeScript", "RxJS"],
    "keywordCoveragePct": 78,
    "confidenceScore": 0.82,
    "gatePassRate": 0.91,
    "flaggedCount": 1,
    "missingKeywords": ["NgRx"],
    "lowFitWarning": false,
    "profileFitScore": 0.85
  },
  "jdExtraction": {
    "requiredSkills": ["Angular", "TypeScript", "RxJS"],
    "preferredSkills": ["NgRx", "Jasmine"],
    "seniority": "mid",
    "domain": "fintech"
  },
  "strategy": "standard",
  "trace": { "totalDurationMs": 32400, "stages": [] },
  "cacheStats": { "hits": 3, "misses": 2, "hitRatio": 0.6 }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `SECURITY_BLOCK` | High-severity threat detected |
| 400 | `INVALID_INPUT` | Missing/empty `jdText` |
| 429 | `QUOTA_EXCEEDED` | Gemini RPM limit hit |
| 500 | `PIPELINE_FAILURE` | Unrecoverable internal error |

---

### POST /api/v1/feedback/:runId

**Request:**
```json
{
  "rating": 4,
  "comments": "string (optional)",
  "bulletsChanged": ["string (optional)"]
}
```

**Response 200:** `{ "acknowledged": true }`

---

### POST /api/v1/eval/run

**Response 200:**
```json
{
  "totalCases": 5,
  "passed": 4,
  "failed": 1,
  "skipped": 0,
  "passRate": 0.8,
  "avgKeywordCoverage": 74.2,
  "interrupted": false,
  "cases": [
    {
      "id": "test-001",
      "name": "Senior React Developer at Fintech",
      "passed": true,
      "keywordCoverage": 81,
      "detectedPersona": "frontend-react",
      "expectedPersona": "frontend-react",
      "personaMatch": true
    }
  ]
}
```

---

### GET /api/v1/health

**Response 200:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "memory": {
    "totalExamples": 42,
    "totalRuns": 15,
    "examplesByPersona": { "frontend-angular": 18, "backend-node": 12 }
  },
  "cache": { "hits": 28, "misses": 12, "ratio": 0.7, "totalEntries": 40 }
}
```

---

## 10. User Flows

### Flow 1: Happy Path — Angular JD

```
1. User runs: POST /generate-resume { jdText: "...Angular 17, RxJS, NgRx..." }
2. Input Guard → clean
3. Query Rewriter → detects "Angular", expands to ["Angular", "AngularJS", "Angular 17"], domain: "fintech", complexity: "medium"
4. Adaptive Router → strategy: "standard" (no prior fintech-angular memory, use base)
5. JD Extraction (Gemini) → requiredSkills: ["Angular", "RxJS", "NgRx", "TypeScript"]
6. Persona Detection → persona: "frontend-angular", isFullstack: false
7. Document Grader → selects top 8 bullets; each uses "angular" variant; "meta" (AI productivity) bullet included
8. Bullet Merge → role A has 6 bullets, maxBulletsPerRole: 4 → merge 2 similar pairs
9. Bullet Rewrite → Gemini rewrites 4 bullets; each passes all 4 gates; 0 fallbacks
10. Profile Filter → title: "Frontend Developer — Angular & TypeScript"; projects filtered to Angular-tagged ones
11. Summary Rewrite → summary now mentions "Angular 17", "RxJS", "fintech domain"
12. PDF Generation → single-page, Arial font, single-column, "Work Experience" header
13. Output Guard → 1 page ✓, 847 chars extractable ✓, keyword coverage 82% ✓
14. Memory → episodic entry saved; 3 high-confidence bullets saved to example_store
15. Response → { resumeId, pdfPath, metadata.keywordCoveragePct: 82 }
```

---

### Flow 2: Stack Switch — Previous Run was Angular, New JD is React

```
1. User submits React JD the next day
2. Persona Detection → persona: "frontend-react"
3. Adaptive Router → queries episodic memory → finds fintech-angular run → persona mismatch → IGNORES prior memory → uses base strategy for frontend-react
4. Document Grader → selects "react" variants for all bullets
5. Resume output → React-specific terminology, Next.js in title, Redux mentioned where relevant
6. No Angular terminology leaks into the React resume
```

---

### Flow 3: Low-Fit Warning — Svelte JD

```
1. User submits JD requiring "Svelte, SvelteKit"
2. Query Rewriter → no synonym expansion for Svelte (no entry in synonym map)
3. JD Extraction → requiredSkills: ["Svelte", "SvelteKit"]
4. Persona Detection → persona: "frontend-generic" (no Svelte persona defined)
5. Document Grader → no bullet has "Svelte" in techTags → all scores < 0.3 → lowFitWarning: true emitted
6. Fallback → generic variants used for all bullets; best-effort rewrite tries to embed "Svelte" naturally
7. Output Guard → warns low coverage but does NOT block
8. Response → includes lowFitWarning: true, missingKeywords: ["Svelte", "SvelteKit"], profileFitScore: 0.28
9. User can review warning and decide whether to apply
```

---

## 11. Edge Cases & Failure Scenarios

| Scenario | System Behavior |
|----------|----------------|
| Gemini returns empty rewrite | Fallback to original variant; flaggedCount++ |
| PDF overflows to 2 pages | Output Guard rejects; retry with maxBulletsPerRole − 1; if still fails → 500 |
| All bullets fail Gate 3 | All bullets use original variants; run completes with warning; confidence score reflects fallbacks |
| JD has no extractable skills | lowFitWarning: true; proceed with generic variants |
| Cache DB locked | Bypass cache; execute Gemini call; log warning |
| Profile has < 10 bullets | Reduce topN; disable merge; run proceeds |
| Gemini quota (429) | Exponential backoff (1s, 2s, 4s); return 429 to client after 3 attempts |
| Episodic memory for wrong persona | Persona mismatch detected; memory ignored; base strategy used |
| Bullet merge loses critical tech term | Log merge warning; proceed; flagged in trace |
| Run completes but DB persist fails | Run succeeds; response returned; memory loss logged as warning |
| Summary rewrite fails validation | Base summary used with keyword injection fallback |
| JD is actually a spam/non-job text | Security guard may not catch; JD extraction will return low-confidence extraction; pipeline continues with low scores |

---

## 12. Security Considerations

### 12.1 Authentication & Authorization

Single-user local system. No authentication layer required. All endpoints are localhost-only.
> If ever exposed beyond localhost: add Bearer token authentication before any public deployment.

### 12.2 Data Protection

| Data | Handling |
|------|---------|
| Gemini API Key | Environment variable only; never logged, never returned in response |
| Profile JSON | Local file; contains no PII beyond name and professional history |
| Generated PDFs | Local filesystem; `output/resumes/` directory |
| MongoDB URI | Environment variable only (`MONGODB_URI`); never logged or hardcoded |

### 12.3 Prompt Security

- Input Guard screens 100% of JD text before it enters any LLM prompt
- Profile data injected into prompts is internally controlled — not user-supplied at runtime
- Prompt Registry is static code — not dynamic or user-configurable

### 12.4 Secrets Management

```
GEMINI_API_KEY=...     # .env file; never committed to VCS
MONGODB_URI=...        # .env file; never committed to VCS
```

`.env` must be in `.gitignore`. No secrets hardcoded.

---

## 13. Assumptions & Risks

### 13.1 Known Assumptions

| # | Assumption |
|---|-----------|
| A-01 | The user has genuine cross-framework competency — bullet variants are honest framings, not fabrications |
| A-02 | `profile.json` is manually maintained by the user; no API or UI for profile editing |
| A-03 | The system is run locally; no multi-tenancy, no auth, no rate limiting beyond Gemini free-tier constraints |
| A-04 | Gemini 2.0 Flash (`gemini-2.0-flash-001`) model string is pinned; silent model upgrades would affect eval baselines |
| A-05 | ATS systems are the primary gatekeeper — PDF formatting must satisfy machine parsing before human aesthetics |
| A-06 | The user will apply via direct company portals, not LinkedIn Easy Apply (Easy Apply's parser distorts keyword data) |
| A-07 | A single-page resume is mandatory for all target roles (mid-level engineer standard) |
| A-08 | AI-leveraged productivity is a legitimate, positive differentiator to include on the resume |

### 13.2 Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Gemini model upgrade changes rewrite style | High | Pin exact model string; run eval suite after any model change |
| Bullet variant missing for detected persona | Medium | `generic` variant required on all bullets; system never crashes on missing variant |
| Low-quality example store degrades few-shot prompts | Medium | Only inject examples with confidence ≥ 0.90 and all gates passed |
| Keyword stuffing detected by ATS | High | Gate 4 structural validation + contextual rewrite prompt explicitly forbid stuffing |
| Profile.json edited with invalid schema | Medium | FR-001 validates schema on every startup; startup fails loudly |
| AI productivity claim perceived negatively by conservative employers | Low | `alwaysInclude: false` toggle available per bullet; user can suppress per run |

---

## 14. Out of Scope

| Item | Reason |
|------|--------|
| Multi-user support | Personal tool; single profile |
| Profile management API (CRUD endpoints) | User edits `profile.json` directly |
| Resume history retrieval endpoint | Resumes are saved to filesystem; no retrieval API needed |
| Cover letter generation | Separate concern; out of scope for v1 |
| LinkedIn profile sync | Applies via direct portals only; LinkedIn parser distortion avoided by design |
| Frontend UI / dashboard | CLI + API only |
| Cloud deployment / hosting | Localhost only |
| Authentication / authorization | Not required for single-user local system |
| Multi-page resume support | Single-page enforced; target roles require this |
| DOCX output format | PDF preferred by FAANG recruiters; clean PDF is the standard |
| LaTeX rendering | Puppeteer + Handlebars sufficient; LaTeX template complexity risks ATS incompatibility |
| Job board integrations | Out of scope; submission is manual |
| Real-time streaming response | PDF generation is synchronous; streaming not applicable |

---

## 15. Future Enhancements

| # | Enhancement | Rationale |
|---|------------|-----------|
| FE-01 | **Cover Letter Generator** | 83% of hiring managers say a tailored cover letter can secure an interview for non-traditional candidates. Same persona + variant architecture applies |
| FE-02 | **LinkedIn Optimization Mode** | Generate ATS-keyword-rich LinkedIn summary from same profile — separate from resume generation |
| FE-03 | **FAANG Mode per Employer** | Specific bullet reordering and vocabulary mapping for Google (scale/latency), Meta (A/B testing/velocity), Amazon (Leadership Principles), Apple (quality/performance), Netflix (ownership/judgment) |
| FE-04 | **Synonym Map Expansion UI** | CLI command to add new tech synonyms without touching source code |
| FE-05 | **Golden Dataset Auto-Growth** | CLI command to promote a successful real run to a golden test case |
| FE-06 | **Prompt Versioning** | Tag each prompt in the Prompt Registry with a version string; store in trace output; correlate quality regressions to prompt changes |
| FE-07 | **AI Productivity Bullet Variants** | Expand the `meta` domain bullet to have employer-specific variants (startup framing vs. enterprise framing) |
| FE-08 | **Fit Score Pre-Check Endpoint** | `POST /api/v1/fit-check` — run only FR-004 + FR-007 scoring without full generation; returns persona + fitScore in <2 seconds for fast go/no-go before committing to a full run |
| FE-09 | **Prompt Injection Audit Log** | Persist all blocked inputs with timestamps for pattern analysis |
| FE-10 | **Two-Page Mode for Senior Roles** | When targeting Staff/Principal roles: lift 1-page constraint; Output Guard allows ≤2 pages; bullets include mentorship and cross-team impact sections |
