# SPEC-001 - Agentic Resume AI

## Software Requirements Specification (SRS) and Software Design Document (SDD)

| Field | Value |
| --- | --- |
| Document ID | SPEC-001 |
| Version | 1.0.0 |
| Date | 2026-04-18 |
| Status | Baseline Generated from `specs/requirements/index.md` |
| Classification | Internal - Single-User Personal Tool |
| Source | `specs/requirements/index.md` (PRD + SRS Hybrid v3.1.0) |

---

## Document Conventions

| Imperative | Meaning |
| --- | --- |
| SHALL | Binding functional requirement; must be verifiable. |
| MUST | Binding non-functional constraint or quality rule. |
| SHOULD | Recommended behavior; non-blocking for baseline acceptance. |
| WILL | Statement of fact or expected behavior; non-binding. |

Requirement identifiers in this document:

- `FR-XXX` Functional requirements
- `NFR-XXX` Non-functional requirements
- `EIR-XXX` External interface requirements

Verification annotations:

- `I` Inspection
- `D` Demonstration
- `A` Analysis
- `T` Test

---

## Table of Contents

- Part I - SRS
  - 1. Introduction
  - 2. Overall Description
  - 3. Functional Requirements
  - 4. Non-Functional Requirements
  - 5. External Interface Requirements
  - 6. Requirements Traceability Matrix
- Part II - SDD
  - 7. Architecture
  - 8. Data Design
  - 9. Service Specifications
  - 10. Pipeline Stages
  - 11. API Contracts
  - 12. Configuration and Operations
  - 13. Risks, Assumptions, and Out of Scope

---

# Part I - Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose

This specification defines a complete backend system that transforms a single master profile into a role-tailored, ATS-safe, single-page PDF resume from runtime job descriptions.

This document formalizes requirements from `specs/requirements/index.md` into a standards-aligned SRS/SDD baseline suitable for implementation and verification.

### 1.2 Scope

In scope:

- JD intake and security sanitization
- Rule-based query rewriting and persona detection
- Adaptive strategy selection
- LLM-based JD extraction, bullet rewriting, summary rewriting
- Multi-gate bullet quality validation
- ATS-safe single-page PDF generation
- Output compliance guard
- Semantic cache and cross-run memory persistence
- Feedback, evaluation suite, and observability endpoints

Out of scope:

- Multi-user tenancy and authentication
- UI/dashboard
- Cover letter generation
- LinkedIn sync and job board integrations
- Cloud hosting and multi-instance scaling

### 1.3 Stakeholders

- System Owner (single user/operator)
- ATS platforms (Workday, Greenhouse, Lever, Ashby, iCIMS)
- Human recruiters (secondary scanning)
- External AI provider (Gemini)

## 2. Overall Description

### 2.1 Product Perspective

The product is a localhost-first backend service, API-driven, with local file storage and local MongoDB persistence. Gemini is the primary external dependency for extraction and rewriting.

### 2.2 Product Functions (Top Level)

1. Load and validate master profile
2. Sanitize and normalize JD
3. Extract JD structure and detect persona
4. Select adaptive strategy
5. Grade, select, merge, rewrite, and validate bullets
6. Filter profile and tailor summary
7. Generate and validate ATS-safe PDF
8. Persist memory, emit run metadata, and return response

### 2.3 Constraints and Assumptions

- Single-user local operation
- One-page PDF target for v1
- Gemini model string pinned
- Profile is manually maintained in JSON
- Honest reframing only, no fabricated claims

## 3. Functional Requirements

| ID | Requirement | Verify |
| --- | --- | --- |
| FR-001 | System SHALL load and schema-validate `data/profile.json` at startup and fail fast on invalid profile. | T |
| FR-002 | System SHALL sanitize/validate JD input and block high-severity prompt-injection patterns with HTTP 400. | T |
| FR-003 | System SHALL apply zero-LLM query rewriting (normalization, synonym expansion, domain and complexity detection). | T |
| FR-004 | System SHALL detect a target persona and primary stack from extracted JD signals. | T |
| FR-005 | System SHALL select adaptive strategy (`fast`, `standard`, `deep`) using complexity and episodic memory. | T |
| FR-006 | System SHALL extract structured JD requirements via Gemini with cache-first behavior. | T |
| FR-007 | System SHALL rank bullets using persona-aware scoring and variant selection rules. | T |
| FR-008 | System SHALL merge overlapping bullets when role bullet count exceeds strategy limits. | T |
| FR-009 | System SHALL rewrite selected bullets with JD context, cache support, and fallback behavior. | T |
| FR-010 | System SHALL enforce 4-gate validation and reject any hallucinated rewrite (Gate 3 zero tolerance). | T |
| FR-011 | System SHALL assemble filtered profile, select projects, and select persona-mapped title. | T |
| FR-012 | System SHALL rewrite summary with persona/domain/seniority constraints and validation fallback. | T |
| FR-013 | System SHALL render ATS-safe PDF with strict template constraints and deterministic output path. | D/T |
| FR-014 | System SHALL run output guard checks (exists, extractable chars, page count, quality thresholds). | T |
| FR-015 | System SHALL persist episodic memory and high-confidence examples after successful runs. | T |
| FR-016 | System SHALL perform prompt-hash semantic caching with TTL-based stale eviction behavior. | T |
| FR-017 | System SHALL accept and persist user feedback by `runId`. | T |
| FR-018 | System SHALL provide offline batch evaluation against golden dataset. | T |
| FR-019 | System SHALL expose health/quality/cost observability endpoints. | T |

## 4. Non-Functional Requirements

### 4.1 Performance

- `NFR-PERF-001`: End-to-end p95 latency MUST be <45s.
- `NFR-PERF-002`: LLM calls per run MUST be <=10 under effective cache conditions.
- `NFR-PERF-003`: PDF render time MUST be <5s.
- `NFR-PERF-004`: Zero-LLM control services SHOULD execute in <200ms combined.

### 4.2 Reliability

- `NFR-REL-001`: Rewrite failures MUST fall back to original variants.
- `NFR-REL-002`: 429 handling MUST follow exponential backoff (1s, 2s, 4s).
- `NFR-REL-003`: Overflow retry MUST execute once with stricter bullet limits.
- `NFR-REL-004`: Memory persistence failures MUST NOT fail the user-facing run.

### 4.3 Security

- `NFR-SEC-001`: Input Guard MUST screen all JD input before LLM use.
- `NFR-SEC-002`: Secrets MUST come from environment variables and never be logged.
- `NFR-SEC-003`: Profile and run data MUST remain local except controlled Gemini requests.
- `NFR-SEC-004`: Local MongoDB deployment MUST be isolated (no public binding).

### 4.4 ATS Compliance

- `NFR-ATS-001`: Output MUST be single-column and machine-parseable.
- `NFR-ATS-002`: Fonts MUST be Arial or Calibri (sans-serif).
- `NFR-ATS-003`: Extractable text MUST be >=500 characters.
- `NFR-ATS-004`: Output MUST remain one page for v1 mode.
- `NFR-ATS-005`: Orthodox section naming and date formatting MUST be enforced.

## 5. External Interface Requirements

| ID | Requirement | Verify |
| --- | --- | --- |
| EIR-API-001 | System SHALL expose REST endpoints under `/api/v1/*`. | T |
| EIR-API-002 | `POST /api/v1/generate-resume` SHALL accept JSON with `jdText`. | T |
| EIR-API-003 | `POST /api/v1/feedback/:runId` SHALL accept rating/notes payload. | T |
| EIR-API-004 | `POST /api/v1/eval/run` SHALL execute batch evaluation and return report. | T |
| EIR-API-005 | `GET /api/v1/health` and observability endpoints SHALL return JSON metrics. | T |
| EIR-SW-001 | System SHALL integrate with Gemini `gemini-2.0-flash-001` for generation and extraction. | T |
| EIR-SW-002 | System SHALL integrate with Puppeteer for PDF rendering. | T |
| EIR-DB-001 | System SHALL use MongoDB collections with documented indexes and TTL policy. | T |

## 6. Requirements Traceability Matrix (Condensed)

| Requirement Block | SDD Section | Primary Service(s) | Verification |
| --- | --- | --- | --- |
| FR-001 | 9.1 | Profile Loader | Test |
| FR-002, FR-003 | 9.2, 9.3 | Input Guard, Query Rewriter | Test |
| FR-004, FR-005 | 9.4, 9.5 | Persona Detector, Adaptive Router | Test |
| FR-006 | 9.6 | JD Extractor + Semantic Cache | Test |
| FR-007, FR-008 | 9.7, 9.8 | Document Grader, Bullet Merge | Test |
| FR-009, FR-010 | 9.9, 9.10 | Bullet Rewriter, Content Guard | Test |
| FR-011, FR-012 | 9.11, 9.12 | Profile Filter, Summary Rewriter | Test |
| FR-013, FR-014 | 9.13, 9.14 | PDF Generator, Output Guard | Test/Demo |
| FR-015, FR-016 | 9.15, 9.16 | Memory Service, Semantic Cache | Test |
| FR-017 | 9.17 | Feedback Service | Test |
| FR-018 | 9.18 | Eval Service | Test |
| FR-019 | 9.19 | Health/Observability Services | Test |

---

# Part II - Software Design Document (SDD)

## 7. Architecture

### 7.1 Architectural Style

- Modular NestJS backend
- Pipeline orchestration with clear stage boundaries
- Mixed deterministic + LLM-assisted processing
- Guard-first flow (Input Guard and Output Guard)
- Memory-enhanced adaptation via MongoDB

### 7.2 Component Model

- API Controller: request/response orchestration
- Input Guard: threat scanning and sanitization
- Query Rewriter: synonym expansion and complexity scoring
- Persona Detector: role/stack classification
- Adaptive Router: strategy derivation with episodic memory
- JD Extractor: Gemini-driven structured extraction
- Document Grader: scoring and ranking
- Bullet Merge: reduction by semantic overlap
- Bullet Rewriter: Gemini rewriting and fallback
- Content Guard: four-gate validation
- Profile Filter: filtered profile assembly and dynamic title
- Summary Rewriter: persona-aligned summary rewrite
- PDF Generator: Handlebars + Puppeteer
- Output Guard: final compliance checks
- Semantic Cache + Memory Service: persistence and retrieval
- Feedback/Eval/Observability services

## 8. Data Design

### 8.1 Core Input Model (`profile.json`)

The master profile SHALL support:

- variant-based achievements (`variants.*` with mandatory `generic`)
- domain typing (`frontend`, `backend`, `fullstack`, `devops`, `data`, `meta`)
- role/project skills and persona-driven selection metadata

### 8.2 Persistence Collections

Mandatory collections:

- `semantic_cache` (`promptHash` unique, TTL on `createdAt`)
- `example_store` (persona + confidence indexed)
- `episodic_memory` (domain + persona indexed)
- `run_history` (`runId` unique)
- `feedback`
- `quality_metrics`
- `cost_tracking`

### 8.3 Relationship Principles

- All run-linked records SHALL reference `runId` UUID (not `ObjectId` foreign keys in API payloads)
- Cache collisions SHALL resolve via upsert semantics
- Example retention SHALL cap per persona via confidence-based eviction

## 9. Service Specifications

### 9.1 Profile Loader

- Validate profile schema at startup
- Enforce `variants.generic` per achievement
- Expose in-memory profile for pipeline execution

### 9.2 Input Guard

- Classify patterns as high vs medium severity
- High severity => HTTP 400 `SECURITY_BLOCK`
- Medium severity => sanitize, continue, log trace annotations

### 9.3 Query Rewriter

- Normalize JD tokens
- Expand synonym sets deterministically
- Compute domain and complexity

### 9.4 Persona Detector

- Score persona taxonomy by extracted-skill overlap
- Detect `isFullstack` from balanced frontend/backend evidence
- Fall back to `generic` on weak signal

### 9.5 Adaptive Router

- Base strategy from complexity
- Override using episodic memory for matching persona/domain
- Enforce conservative escalation on weak memory coverage

### 9.6 JD Extractor

- Cache-first extraction
- Gemini-based structured output parsing
- Retry and structured failure behavior for malformed outputs and 429

### 9.7 Document Grader

- Variant selection priority: persona-specific -> `generic`
- Composite scoring:
  - cosine similarity (0.5)
  - tech overlap (0.3)
  - persona match (0.2)
- Reweight if suspiciously flat score distribution

### 9.8 Bullet Merge

- Group by role
- Merge high-overlap bullet pairs when over per-role limits
- Preserve critical tech terms, emit warnings on loss

### 9.9 Bullet Rewriter

- Cache-first rewrite path
- Prompt constraints: action verb, keyword inclusion, <=170 chars, XYZ formula, no first person
- Retry policy controlled by strategy
- Hard fallback to original variant on failure

### 9.10 Content Guard (4 Gates)

1. Semantic fidelity threshold
2. JD keyword presence
3. Hallucination zero-tolerance
4. Structural constraints

`confidence = 0.5*fidelity + 0.3*keyword + 0.2*structure` (computed only after hallucination pass)

### 9.11 Profile Filter

- Build filtered profile from finalized bullet set
- Select projects by persona-relevance scoring
- Apply persona-title mapping

### 9.12 Summary Rewriter

- Persona/seniority/domain aligned summary rewrite
- Validation fallback to base summary with minimal keyword reinforcement

### 9.13 PDF Generator

- Render with strict ATS-safe template constraints
- Export to `output/resumes/resume_{runId}.pdf`

### 9.14 Output Guard

- Validate extractable text floor
- Validate one-page output
- Enforce minimum metadata and threshold checks

### 9.15 Memory Service

- Persist episodic records per run
- Persist high-confidence examples
- Trim per persona retention windows

### 9.16 Semantic Cache

- SHA-256 prompt hash keying
- Unique index + TTL expiration
- Hit/miss tracking metadata

### 9.17 Feedback Service

- Upsert feedback by `runId`
- Validate rating bounds (1-5)

### 9.18 Eval Service

- Batch execution over golden dataset
- Produce pass/fail/skipped report with aggregate stats

### 9.19 Health and Observability

- Health status, cache metrics, quality trends, and cost metrics
- Degraded mode semantics when MongoDB is unavailable

## 10. Pipeline Stages

1. Input Guard
2. Query Rewriter
3. Adaptive Router (initial)
4. JD Extraction
5. Persona Detection
6. Adaptive Router (finalize strategy)
7. Document Grading + Variant Selection
8. Bullet Merge
9. Bullet Rewrite + Content Guard
10. Profile Filtering + Title Selection
11. Summary Rewrite
12. PDF Generation
13. Output Guard
14. Memory Persistence
15. Response Assembly

## 11. API Contracts (Normative)

### 11.1 `POST /api/v1/generate-resume`

- Request: `{ jdText: string(1..10000) }`
- Success includes:
  - `resumeId`, `pdfPath`
  - `metadata` (persona, coverage, confidence, flags)
  - `jdExtraction`
  - `strategy`, `trace`, `cacheStats`
- Errors:
  - `400 SECURITY_BLOCK`
  - `400 INVALID_INPUT`
  - `429 QUOTA_EXCEEDED`
  - `500 PIPELINE_FAILURE`

### 11.2 `POST /api/v1/feedback/:runId`

- Request: rating (1-5), optional comments/bulletsChanged
- Response: acknowledgment

### 11.3 `POST /api/v1/eval/run`

- Response includes total/passed/failed/skipped/passRate and per-case details

### 11.4 `GET /api/v1/health`

- Returns health status + cache/memory telemetry

## 12. Configuration and Operations

Required environment variables:

- `GEMINI_API_KEY`
- `MONGODB_URI` (default localhost database)
- optional tuning values for thresholds and limits

Operational mandates:

- `.env` MUST remain gitignored
- prompt registry SHOULD remain static and versioned
- any model-string change SHOULD trigger offline eval rerun

## 13. Risks, Assumptions, and Out of Scope

### 13.1 Assumptions

- Cross-framework competency represented in profile is factual
- User directly maintains profile JSON
- Local operation only

### 13.2 Primary Risks

- Model behavior drift
- Missing persona variants
- quality decay from low-confidence examples
- schema drift in profile edits

### 13.3 Out of Scope (v1)

- Multi-user, auth, cloud deployment
- Cover letters and LinkedIn sync
- UI/dashboard
- multi-page mode (except future enhancement track)

---

## Appendix A - Source Mapping

This specification is generated directly from `specs/requirements/index.md` sections:

- Sections 1-5 mapped to SRS intent and FR catalog
- Section 6 mapped to NFR catalog
- Sections 7-8 mapped to architecture and data design
- Section 9 mapped to normative API contracts
- Sections 10-11 mapped to runtime flow and failure handling
- Sections 12-15 mapped to security, risk, scope, and roadmap constraints

