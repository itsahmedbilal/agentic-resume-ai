import { BulletRecord, MasterProfile } from './profile.model';
import { JDExtraction } from './jd-extraction.model';
import { ValidationResult } from './validation-result.model';

/**
 * Shared context object that flows through all pipeline stages.
 * Each stage reads from and writes to this context.
 */
export interface PipelineContext {
  // Run metadata
  runId: string;
  generatedAt: string;
  strategy: PipelineStrategy;

  // Input
  rawJdText: string;
  sanitizedJdText: string;

  // Query rewriting output
  rewrittenQuery: RewrittenQuery | null;

  // JD extraction output
  jdExtraction: JDExtraction | null;
  jdDecomposition: JDDecomposition | null;

  // Profile data
  profile: MasterProfile;
  allBullets: BulletRecord[];

  // Grading output
  gradedBullets: GradedBullet[];

  // Rewrite output
  mergedBullets: Map<string, string[]>;       // roleKey → merged bullets
  rewrittenMap: Map<string, string>;           // originalText → rewrittenText
  confidenceScores: Map<string, number>;       // originalText → confidence

  // Validation output
  gateResults: (ValidationResult & { original: string })[];
  flaggedCount: number;

  // Summary
  tailoredSummary: string | null;

  // PDF output
  pdfPath: string | null;
  pageCount: number;

  // Response metadata
  keywordCoveragePct: number;
  missingKeywords: string[];
  avgConfidence: number;
}

export interface PipelineStrategy {
  type: 'fast' | 'standard' | 'deep';
  topN: number;
  merge: boolean;
  retries: number;
  concurrency: number;
  maxBulletsPerRole: number;
  maxProjects: number;
  maxBulletChars: number;
  reason: string;
}

export interface RewrittenQuery {
  normalizedText: string;
  expandedSkills: string[];
  inferredSkills: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  jdDomain: string;
  synonymMap: Map<string, string[]>;
}

export interface JDDecomposition {
  coreRequirements: DecomposedRequirement[];
  secondaryRequirements: DecomposedRequirement[];
  domainContext: string;
  senioritySignals: string[];
  culturalSignals: string[];
}

export interface DecomposedRequirement {
  skill: string;
  importance: 'must-have' | 'nice-to-have';
  category: 'frontend' | 'backend' | 'infrastructure' | 'data' | 'soft-skill' | 'other';
}

export interface GradedBullet {
  bullet: BulletRecord;
  relevanceScore: number;
  reasoning: string;
  suggestedKeywords: string[];
}

export function createEmptyContext(
  runId: string,
  profile: MasterProfile,
  allBullets: BulletRecord[],
  rawJdText: string,
): PipelineContext {
  return {
    runId,
    generatedAt: new Date().toISOString(),
    strategy: {
      type: 'standard',
      topN: 8,
      merge: true,
      retries: 0,
      concurrency: 2,
      maxBulletsPerRole: 4,
      maxProjects: 2,
      maxBulletChars: 170,
      reason: 'default',
    },
    rawJdText,
    sanitizedJdText: rawJdText,
    rewrittenQuery: null,
    jdExtraction: null,
    jdDecomposition: null,
    profile,
    allBullets,
    gradedBullets: [],
    mergedBullets: new Map(),
    rewrittenMap: new Map(),
    confidenceScores: new Map(),
    gateResults: [],
    flaggedCount: 0,
    tailoredSummary: null,
    pdfPath: null,
    pageCount: 0,
    keywordCoveragePct: 0,
    missingKeywords: [],
    avgConfidence: 0,
  };
}
