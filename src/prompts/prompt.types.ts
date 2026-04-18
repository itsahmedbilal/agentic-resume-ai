/**
 * Typed prompt system — every prompt is versioned, typed, and registered.
 * No hardcoded strings anywhere else in the codebase.
 */

export interface PromptTemplate<TInput = any, TOutput = any> {
  /** Unique identifier, e.g. 'jd-extraction' */
  id: string;
  /** Semantic version number */
  version: number;
  /** Human-readable name */
  name: string;
  /** What this prompt does */
  description: string;
  /** Build the prompt string from typed input */
  build(input: TInput): string;
  /** Parse raw LLM output into typed result */
  parseOutput(raw: string): TOutput;
  /** Suggested maxOutputTokens for this prompt */
  maxTokens: number;
}

export interface PromptSummary {
  id: string;
  version: number;
  name: string;
  description: string;
  maxTokens: number;
}

// ──────────────────────────────────────────────
// Input/Output types for each prompt template
// ──────────────────────────────────────────────

export interface JdExtractionInput {
  jdText: string;
}

export interface JdExtractionOutput {
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: string;
  domainContext: string;
  companyContext: string;
}

export interface BulletRewriteInput {
  originalText: string;
  requiredSkills: string[];
  seniority: string;
  domainContext: string;
  strict: boolean;
  examplesBlock: string;
}

export interface BulletRewriteOutput {
  rewrittenText: string;
}

export interface BulletMergeInput {
  bullets: string[];
  maxOutputBullets: number;
  requiredSkills: string[];
  maxCharsPerBullet: number;
}

export interface BulletMergeOutput {
  mergedBullets: string[];
}

export interface SummaryRewriteInput {
  originalSummary: string;
  seniority: string;
  domainContext: string;
  topSkills: string[];
}

export interface SummaryRewriteOutput {
  rewrittenSummary: string;
}

export interface DocumentGradingInput {
  bullets: Array<{ index: number; text: string; role: string; tech: string[] }>;
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: string;
  topN: number;
}

export interface DocumentGradingOutput {
  graded: Array<{
    index: number;
    score: number;
    reasoning: string;
    suggestedKeywords: string[];
  }>;
}

export interface JdDecompositionInput {
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: string;
  domainContext: string;
}
