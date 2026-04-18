# SPEC-001 - API Contract Specification

## 0. Document Control

### 0.1 Metadata

| Field | Value |
| --- | --- |
| Document | API |
| Spec ID | SPEC-001 |
| Version | 1.2.0 |
| Date | 2026-04-18 |
| Status | Active |
| Parent Source | `specs/requirements/index.md` |

### 0.2 Document History

| Version | Date | Change | Author |
| --- | --- | --- | --- |
| 1.0.0 | 2026-04-18 | Initial API contract breakout document | Codex |
| 1.1.0 | 2026-04-18 | Added formal document control and history | Codex |
| 1.2.0 | 2026-04-18 | Added output quality and application guidance contract fields | Codex |

## 1. Conventions

- Base path: `/api/v1`
- Content type: `application/json`
- Error response shape should include `code`, `message`, and contextual metadata where available.

## 2. Endpoints

### 2.1 POST `/api/v1/generate-resume`

#### Request

```json
{
  "jdText": "string (required, length 1..10000)"
}
```

#### Success Response (200)

```json
{
  "resumeId": "uuid",
  "pdfPath": "output/resumes/resume_{runId}.pdf",
  "metadata": {
    "persona": "frontend-angular",
    "detectedStack": ["Angular", "TypeScript", "RxJS"],
    "targetCompanyProfile": "google",
    "keywordCoveragePct": 78,
    "confidenceScore": 0.82,
    "gatePassRate": 0.91,
    "flaggedCount": 1,
    "missingKeywords": ["NgRx"],
    "lowFitWarning": false,
    "profileFitScore": 0.85,
    "qualitySignals": {
      "atsSingleColumnPass": true,
      "atsStandardSectionHeadersPass": true,
      "contextualKeywordIntegrationPass": true,
      "xyzBulletCompliancePct": 0.86,
      "actionVerbStartPct": 0.93,
      "acronymExpansionPass": true
    }
  },
  "jdExtraction": {
    "requiredSkills": ["Angular", "TypeScript", "RxJS"],
    "preferredSkills": ["NgRx", "Jasmine"],
    "seniority": "mid",
    "domain": "fintech"
  },
  "strategy": "standard",
  "submissionGuidance": {
    "recommendedChannel": "direct_company_portal",
    "avoidChannels": ["linkedin_easy_apply"],
    "reason": "Third-party apply flows can reparse and remap formatting, dates, and skill taxonomy."
  },
  "trace": { "totalDurationMs": 32400, "stages": [] },
  "cacheStats": { "hits": 3, "misses": 2, "hitRatio": 0.6 }
}
```

#### Error Codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `SECURITY_BLOCK` | high-severity malicious/jailbreak pattern detected |
| 400 | `INVALID_INPUT` | missing or invalid request payload |
| 429 | `QUOTA_EXCEEDED` | Gemini quota/rate limit exhausted |
| 500 | `PIPELINE_FAILURE` | unrecoverable internal pipeline failure |

### 2.2 POST `/api/v1/feedback/:runId`

#### Request

```json
{
  "rating": 4,
  "comments": "optional text",
  "bulletsChanged": ["optional bullet note"]
}
```

#### Success Response (200)

```json
{ "acknowledged": true }
```

#### Error Cases

- `400 INVALID_INPUT` (rating not 1..5)
- `404 RUN_NOT_FOUND` (runId missing in run history)

### 2.3 POST `/api/v1/eval/run`

#### Success Response (200)

```json
{
  "totalCases": 5,
  "passed": 4,
  "failed": 1,
  "skipped": 0,
  "passRate": 0.8,
  "avgKeywordCoverage": 74.2,
  "interrupted": false,
  "cases": []
}
```

### 2.4 GET `/api/v1/health`

#### Success Response (200)

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

## 3. Contract Stability Rules

- Additive response fields are allowed in minor versions.
- Removing or renaming fields requires a major version bump.
- Error code semantics must remain stable across versions.

## 4. Revision Governance

Any contract change requires:

1. explicit version bump in this API document
2. matching requirement update in `SRS.md` (and `NFR.md` if quality behavior changed)
3. RTM update in `RTM.md`
