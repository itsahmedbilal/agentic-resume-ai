# SPEC-001 - Software Requirements Specification (SRS)

## 0. Document Control

### 0.1 Metadata


| Field         | Value                         |
| ------------- | ----------------------------- |
| Document      | SRS                           |
| Spec ID       | SPEC-001                      |
| Version       | 1.1.0                         |
| Date          | 2026-04-18                    |
| Status        | Active                        |
| Parent Source | `specs/requirements/index.md` |


### 0.2 Document History


| Version | Date       | Change                                    | Author |
| ------- | ---------- | ----------------------------------------- | ------ |
| 1.0.0   | 2026-04-18 | Initial SRS breakout document             | Codex  |
| 1.1.0   | 2026-04-18 | Added formal document control and history | Codex  |


## 1. Introduction

### 1.1 Purpose

Define the required behavior of Agentic Resume AI, a single-user backend that converts a master profile and runtime job description into an ATS-optimized, two-page PDF resume.

### 1.2 Scope

In scope:

- secure JD intake and sanitization
- persona-aware variant selection and bullet rewriting
- validation gates and fallback behavior
- ATS-safe PDF generation with 1-2 page allowance based on content fit
- memory, cache, feedback, evaluation, and observability endpoints

Out of scope:

- multi-user/auth
- cloud deployment
- UI/dashboard
- cover letters and external job-board integrations

### 1.3 Stakeholders

- system owner (single operator)
- ATS systems consuming output PDFs
- recruiters scanning final resume
- Gemini API as external generation dependency

## 2. Functional Requirements


| ID     | Requirement Statement                                                                                    | Verify |
| ------ | -------------------------------------------------------------------------------------------------------- | ------ |
| FR-001 | System SHALL load and validate `data/profile.json` at startup and fail loudly on schema violations.      | T      |
| FR-002 | System SHALL sanitize and validate incoming JD text and block high-severity injection patterns.          | T      |
| FR-003 | System SHALL rewrite/normalize JD terms with deterministic synonym expansion and complexity scoring.     | T      |
| FR-004 | System SHALL detect a role persona and stack profile from extracted JD signals.                          | T      |
| FR-005 | System SHALL choose adaptive strategy (`fast`, `standard`, `deep`) using complexity and episodic memory. | T      |
| FR-006 | System SHALL extract structured JD fields via Gemini with cache-first retrieval.                         | T      |
| FR-007 | System SHALL grade and rank bullets using persona-aware scoring and variant-priority fallback rules.     | T      |
| FR-008 | System SHALL merge semantically overlapping bullets if role bullet count exceeds limits.                 | T      |
| FR-009 | System SHALL rewrite selected bullets with constrained prompts and deterministic fallback behavior.      | T      |
| FR-010 | System SHALL enforce four-gate validation and reject any hallucinated rewrite immediately.               | T      |
| FR-011 | System SHALL assemble filtered profile content and select a persona-specific resume title.               | T      |
| FR-012 | System SHALL rewrite professional summary by persona/seniority/domain, with guarded fallback.            | T      |
| FR-013 | System SHALL generate ATS-safe PDF output at deterministic file path under output directory.             | D/T    |
| FR-014 | System SHALL verify output quality (extractable text, page count, metadata, quality thresholds).         | T      |
| FR-015 | System SHALL persist episodic memory and high-confidence examples after successful runs.                 | T      |
| FR-016 | System SHALL cache LLM responses by prompt hash with stale-entry handling.                               | T      |
| FR-017 | System SHALL accept and persist run-level user feedback (`rating`, `comments`, `bulletsChanged`).        | T      |
| FR-018 | System SHALL run offline evaluation over golden dataset and return aggregate report.                     | T      |
| FR-019 | System SHALL expose health, quality, and cost observability endpoints.                                   | T      |


## 3. Acceptance-Critical Behaviors

### 3.1 Honesty and Non-Fabrication

- The system shall optimize wording and ordering, not fabricate experience.
- Missing persona variant shall fall back to `generic`, not fail the run.

### 3.2 Safety and Degradation

- Any bullet rewrite validation failure shall use original variant text.
- DB persistence failures shall not fail resume generation response.
- Low-fit scenarios shall complete with warnings and explicit missing keywords.

### 3.3 Output Integrity

- Output shall remain within 1-2 pages in v1 mode.
- ATS extraction floor shall be enforced before success response.

## 4. Assumptions and Risks (SRS Level)

Assumptions:

- User profile is accurate and manually maintained.
- Gemini model remains available and version pinning is respected.

Primary risks:

- model drift changing rewrite behavior
- profile schema drift from manual edits
- low-quality examples polluting few-shot prompt context

## 5. Revision Governance

Any FR-level change requires:

1. update this SRS document with requirement ID and verification method
2. corresponding update in `RTM.md`
3. related design update in `SDD.md`

