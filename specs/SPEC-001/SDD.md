# SPEC-001 - Software Design Document (SDD)

## 0. Document Control

### 0.1 Metadata

| Field | Value |
| --- | --- |
| Document | SDD |
| Spec ID | SPEC-001 |
| Version | 1.1.0 |
| Date | 2026-04-18 |
| Status | Active |
| Parent Source | `specs/requirements/index.md` |

### 0.2 Document History

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 1.0.0 | 2026-04-18 | Initial SDD breakout document | Codex |
| 1.1.0 | 2026-04-18 | Added formal document control and history | Codex |

## 1. Architecture Overview

### 1.1 Style

- Modular NestJS architecture
- Pipeline orchestrator with staged execution
- Guard-first processing (Input Guard and Output Guard)
- Deterministic + LLM hybrid strategy
- Memory- and cache-augmented adaptation

### 1.2 High-Level Components

| Component | Responsibility |
| --- | --- |
| Resume Controller | request validation, orchestration entrypoint, response shaping |
| Input Guard | sanitize JD and block high-risk prompt-injection patterns |
| Query Rewriter | skill normalization, synonym expansion, complexity scoring |
| Persona Detector | classify role persona and stack orientation |
| Adaptive Router | strategy selection using complexity + episodic memory |
| JD Extractor | structured extraction from Gemini with cache-first flow |
| Document Grader | variant selection, scoring, top-N ranking |
| Bullet Merge | semantic consolidation when role bullet limits are exceeded |
| Bullet Rewriter | LLM rewriting with strict prompt constraints |
| Content Guard | 4-gate validation and confidence scoring |
| Profile Filter | assemble final profile, role/project pruning, dynamic title |
| Summary Rewriter | persona-specific summary adaptation |
| PDF Generator | render ATS-safe PDF via Handlebars + Puppeteer |
| Output Guard | enforce final quality and ATS compliance checks |
| Semantic Cache | prompt-hash deduplication for LLM calls |
| Memory Service | episodic memory + high-confidence example persistence |
| Observability Services | health, quality, cost, trace metrics |
| Feedback Service | persist per-run user feedback |
| Evaluation Service | golden dataset batch evaluation |

## 2. Data Design

### 2.1 Core Input Model

`profile.json` design principles:

- variant-first achievement design with required `generic` fallback
- explicit domain tags and tech tags per bullet
- persona-based title selection from `titles[]`
- project selection by persona relevance

### 2.2 Persistence Model

Primary collections:

- `semantic_cache` (`promptHash` unique, TTL index)
- `example_store` (persona, confidence-indexed)
- `episodic_memory` (domain+persona indexed)
- `run_history` (`runId` unique)
- `feedback`
- `quality_metrics`
- `cost_tracking`

## 3. Pipeline Design

1. Validate request DTO
2. Input Guard sanitization
3. Query Rewriter enrichment
4. Initial adaptive strategy
5. JD extraction (cache-first)
6. Persona detection
7. Strategy finalization
8. Bullet grading and variant selection
9. Optional bullet merge
10. Rewrite and validation per bullet
11. Profile and project filtering
12. Summary rewrite
13. PDF generation
14. Output guard checks
15. Memory persistence
16. Response assembly

## 4. Service-Level Rules

### 4.1 Validation and Fallback

- Gate 3 hallucination is hard-fail.
- Any rewrite failure falls back to original variant.
- Pipeline should complete with warnings where safe.

### 4.2 Cache and Memory

- All Gemini prompt calls pass through semantic cache lookup.
- High-confidence successful rewrites feed example store.
- Episodic memory influences future strategy per domain+persona.

### 4.3 PDF and ATS Contract

- Enforce output within 1-2 pages in v1 mode.
- Enforce minimum extractable text threshold.
- Maintain ATS-friendly section naming and layout constraints.

## 5. Observability Design

Trace and metadata should capture:

- stage durations
- cache hit/miss stats
- confidence and gate pass ratios
- flagged bullet counts
- low-fit warnings
- LLM token/cost indicators when available

## 6. Revision Governance

Design changes must preserve traceability to requirement IDs and update:

1. affected sections in this `SDD.md`
2. impacted endpoint examples in `API.md` when contract changes
3. row mappings in `RTM.md`
