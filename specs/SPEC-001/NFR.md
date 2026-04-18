# SPEC-001 - Non-Functional Requirements (NFR)

## 0. Document Control

### 0.1 Metadata

| Field | Value |
| --- | --- |
| Document | NFR |
| Spec ID | SPEC-001 |
| Version | 1.1.0 |
| Date | 2026-04-18 |
| Status | Active |
| Parent Source | `specs/requirements/index.md` |

### 0.2 Document History

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 1.0.0 | 2026-04-18 | Initial NFR breakout document | Codex |
| 1.1.0 | 2026-04-18 | Added formal document control and history | Codex |

## 1. Performance

| ID | Requirement | Target | Verify |
| --- | --- | --- | --- |
| NFR-PERF-001 | End-to-end generation latency | p95 < 45s | T |
| NFR-PERF-002 | LLM calls per run with cache | <= 10 | T |
| NFR-PERF-003 | PDF rendering duration | < 5s | T |
| NFR-PERF-004 | Zero-LLM control path (aggregate) | < 200ms | T |
| NFR-PERF-005 | Cache lookup latency | < 10ms (expected) | A/T |

## 2. Reliability

| ID | Requirement | Rule | Verify |
| --- | --- | --- | --- |
| NFR-REL-001 | Bullet-level failure isolation | rewrite failures fall back to original; pipeline continues | T |
| NFR-REL-002 | Quota retry policy | 429 backoff sequence: 1s -> 2s -> 4s | T |
| NFR-REL-003 | Overflow resilience | one automatic retry with reduced bullets/page pressure | T |
| NFR-REL-004 | Persistence fault tolerance | memory/cache DB write failure is non-blocking | T |

## 3. Security

| ID | Requirement | Rule | Verify |
| --- | --- | --- | --- |
| NFR-SEC-001 | Prompt injection defense | high-severity patterns blocked pre-LLM | T |
| NFR-SEC-002 | Secret isolation | API keys/DB URI from env only, never logged | I/T |
| NFR-SEC-003 | Controlled egress | profile data sent only via intended Gemini calls | I |
| NFR-SEC-004 | Local DB isolation | MongoDB localhost and non-public binding in local mode | I |

## 4. ATS Compliance

| ID | Requirement | Rule | Verify |
| --- | --- | --- | --- |
| NFR-ATS-001 | Layout | single-column only | I/D |
| NFR-ATS-002 | Typography | Arial or Calibri (sans-serif) | I |
| NFR-ATS-003 | Extractability floor | >= 500 characters | T |
| NFR-ATS-004 | Page limit | 1-2 pages (v1 mode) | T |
| NFR-ATS-005 | Section labels | orthodox naming only | I |
| NFR-ATS-006 | Date formatting | MM/YYYY | I/T |
| NFR-ATS-007 | Header/footer behavior | contact info in body, not PDF metadata/header/footer | I/T |

## 5. Scalability and Deployment Constraints

- Single-user, single-instance by design.
- Cost efficiency is prioritized over horizontal scalability.
- Free-tier Gemini usage constraints are first-class operational constraints.

## 6. Operability

- Health and observability endpoints must expose degraded mode when DB unavailable.
- Offline evaluation suite should be runnable to detect model or prompt regressions.

## 7. Revision Governance

Any NFR-level change requires:

1. update this NFR catalog with target and verification method
2. corresponding mapping update in `RTM.md`
3. implementation alignment check in `SDD.md`
