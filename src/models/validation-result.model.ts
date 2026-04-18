/**
 * Result of the 4-gate validation engine for a single rewritten bullet.
 * Extracted from ValidationService to be a shared model.
 */
export interface ValidationResult {
  gatesPassed: boolean;
  fidelityScore: number;
  keywordFound: boolean;
  hallucinationDetected: boolean;
  structurePass: boolean;
  confidenceScore: number;
  failReasons: string[];
}

/**
 * Result of content guard checks on any LLM output.
 */
export interface ContentCheckResult {
  hasPII: boolean;
  hasInjection: boolean;
  hasHallucination: boolean;
  isSafe: boolean;
  details: string[];
}

/**
 * Result of merge validation — ensures merged bullets preserve information.
 */
export interface MergeValidationResult {
  allTechPreserved: boolean;
  allMetricsPreserved: boolean;
  missingTech: string[];
  missingMetrics: string[];
  isValid: boolean;
}

/**
 * Final output validation before returning to user.
 */
export interface OutputValidationResult {
  pdfExists: boolean;
  pdfPageCount: number;
  isOnePage: boolean;
  atsCompliant: boolean;
  metadataComplete: boolean;
  approved: boolean;
  issues: string[];
}
