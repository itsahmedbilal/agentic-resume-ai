# SPEC-001 - Requirements Traceability Matrix (RTM)

## 0. Document Control

### 0.1 Metadata

| Field | Value |
| --- | --- |
| Document | RTM |
| Spec ID | SPEC-001 |
| Version | 1.1.0 |
| Date | 2026-04-18 |
| Status | Active |
| Parent Source | `specs/requirements/index.md` |

### 0.2 Document History

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 1.0.0 | 2026-04-18 | Initial RTM breakout document | Codex |
| 1.1.0 | 2026-04-18 | Added formal document control and history | Codex |

## 1. Purpose

Provide bidirectional traceability between requirements, design components, and verification intent.

## 2. Matrix

| Requirement | Design Realization | Primary Service/Module | Verification |
| --- | --- | --- | --- |
| FR-001 | Profile ingestion and schema validation on startup | Profile Loader | Test |
| FR-002 | Threat-pattern screening and sanitization path | Input Guard | Test |
| FR-003 | Deterministic normalization and synonym expansion | Query Rewriter | Test |
| FR-004 | Persona taxonomy scoring and fallback | Persona Detector | Test |
| FR-005 | Complexity + memory-driven strategy routing | Adaptive Router | Test |
| FR-006 | Cache-first structured JD extraction | JD Extractor, Semantic Cache | Test |
| FR-007 | Variant-priority grading and ranking | Document Grader | Test |
| FR-008 | Role-level semantic bullet merge | Bullet Merge | Test |
| FR-009 | Prompt-constrained bullet rewriting + retry/fallback | Bullet Rewriter | Test |
| FR-010 | Four-gate validation and confidence computation | Content Guard | Test |
| FR-011 | Filtered profile assembly and title selection | Profile Filter | Test |
| FR-012 | Tailored summary rewrite with guarded fallback | Summary Rewriter | Test |
| FR-013 | ATS-safe PDF render pipeline | PDF Generator | Demonstration/Test |
| FR-014 | Post-render quality and ATS checks | Output Guard | Test |
| FR-015 | Episodic memory and example persistence | Memory Service | Test |
| FR-016 | Prompt-hash cache lifecycle and dedupe | Semantic Cache | Test |
| FR-017 | Feedback capture by runId | Feedback Service | Test |
| FR-018 | Golden dataset batch-run evaluation | Evaluation Service | Test |
| FR-019 | Health, quality, and cost visibility endpoints | Observability Services | Test |

## 3. NFR Mapping (Condensed)

| NFR | Design Realization | Verification |
| --- | --- | --- |
| NFR-PERF-* | Cache-first calls, bounded strategy, stage timing | Test/Analysis |
| NFR-REL-* | Bullet-level fallback, retry policy, non-blocking persistence | Test |
| NFR-SEC-* | Input Guard, env-secret policy, local DB isolation | Inspection/Test |
| NFR-ATS-* | Template constraints + Output Guard checks | Inspection/Test |

## 4. Change Management Rule

Whenever a requirement is added/updated:

1. update `SRS.md` or `NFR.md`
2. update impacted section in `SDD.md`
3. update this RTM row set
4. update `API.md` if contract surface changed
