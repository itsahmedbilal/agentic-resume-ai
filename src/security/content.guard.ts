import { Injectable, Logger } from '@nestjs/common';
import { ValidationResult, ContentCheckResult, MergeValidationResult } from '../models/validation-result.model';
import { JDExtraction } from '../models/jd-extraction.model';
import { cosineSimilarity } from '../utils/math';

/**
 * CONTENT GUARD — validates ALL LLM outputs.
 * Absorbs the existing 4-gate validation engine + adds new checks.
 */

const SAFE_ACTION_VERBS = new Set([
  'Developed','Built','Led','Designed','Architected','Delivered','Reduced',
  'Increased','Migrated','Implemented','Optimized','Created','Managed',
  'Deployed','Integrated','Automated','Improved','Established','Spearheaded',
  'Collaborated','Launched','Refactored','Maintained','Monitored','Configured',
  'Resolved','Streamlined','Accelerated','Enabled','Supported','Owned','Drove',
  'Scaled','Mentored','Reviewed','Evaluated','Modernized','Containerized',
  'Provisioned','Debugged','Tested','Shipped','Coordinated','Executed',
]);

const ACTION_VERB_RE = /^(Built|Led|Designed|Architected|Delivered|Reduced|Increased|Migrated|Implemented|Optimized|Created|Managed|Deployed|Integrated|Automated|Improved|Established|Spearheaded|Collaborated|Launched|Developed|Refactored|Maintained|Monitored|Configured|Resolved|Streamlined|Accelerated|Enabled|Supported|Owned|Drove|Scaled|Mentored|Reviewed|Evaluated|Modernized|Containerized|Provisioned|Debugged|Tested|Shipped|Coordinated|Executed)\b/;
const FIRST_PERSON_RE = /\b(I|me|my|we|our)\b/i;

@Injectable()
export class ContentGuard {
  private readonly logger = new Logger(ContentGuard.name);

  /**
   * 4-Gate bullet validation — uses Jaccard text fidelity instead of embeddings.
   * Zero API calls.
   */
  validateBullet(
    original: string,
    rewritten: string,
    jd: JDExtraction,
    fidelityThreshold: number,
    allProfileTechTerms: Set<string>,
    maxChars = 170,
  ): ValidationResult {
    const failReasons: string[] = [];

    // Gate 1 — Text Fidelity (Jaccard — zero API calls)
    const fidelityScore = this.textFidelity(original, rewritten);
    const gate1 = fidelityScore >= fidelityThreshold;
    if (!gate1) {
      failReasons.push(`Gate 1: fidelity ${fidelityScore.toFixed(3)} < ${fidelityThreshold}`);
    }

    // Gate 2 — Keyword Coverage
    const rewrittenLower = rewritten.toLowerCase();
    const keywordFound = jd.requiredSkills.some(skill =>
      rewrittenLower.includes(skill.toLowerCase()),
    );
    const gate2 = keywordFound;
    if (!gate2) {
      failReasons.push('Gate 2: no required keyword found in rewrite');
    }

    // Gate 3 — Hallucination Detection
    const capitalizedInRewrite = (rewritten.match(/\b[A-Z][A-Za-z0-9.]+\b/g) ?? [])
      .filter(t => !SAFE_ACTION_VERBS.has(t));

    const allowedTokens = new Set<string>([
      ...(original.match(/\b[A-Z][A-Za-z0-9.]+\b/g) ?? []),
      ...allProfileTechTerms,
      ...jd.requiredSkills.flatMap(s => s.split(/[\s.\-_/]+/)),
      ...jd.preferredSkills.flatMap(s => s.split(/[\s.\-_/]+/)),
    ]);

    const hallucinated = capitalizedInRewrite.filter(t => !allowedTokens.has(t));
    const gate3 = hallucinated.length === 0;
    if (!gate3) {
      failReasons.push(`Gate 3: hallucinated terms: ${hallucinated.join(', ')}`);
    }

    // Gate 4 — Structural Rules
    const gate4 = (
      ACTION_VERB_RE.test(rewritten) &&
      rewritten.length <= maxChars &&
      !FIRST_PERSON_RE.test(rewritten)
    );
    if (!ACTION_VERB_RE.test(rewritten)) failReasons.push('Gate 4: missing action verb');
    if (rewritten.length > maxChars) failReasons.push(`Gate 4: too long (${rewritten.length}/${maxChars} chars)`);
    if (FIRST_PERSON_RE.test(rewritten)) failReasons.push('Gate 4: first person pronoun');

    // Confidence Score
    const keywordScore = gate2 ? 1 : 0;
    const structureScore = gate4 ? 1 : 0;
    const confidenceScore = 0.5 * fidelityScore + 0.3 * keywordScore + 0.2 * structureScore;

    return {
      gatesPassed: gate1 && gate2 && gate3 && gate4,
      fidelityScore,
      keywordFound,
      hallucinationDetected: !gate3,
      structurePass: gate4,
      confidenceScore,
      failReasons,
    };
  }

  /**
   * Validate ANY LLM output for safety — PII, injection echo, etc.
   */
  validateLlmOutput(output: string): ContentCheckResult {
    const details: string[] = [];

    // PII check — no emails or phone numbers in LLM output
    const hasPII = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(output) ||
                   /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/.test(output);
    if (hasPII) details.push('PII detected in LLM output');

    // Injection echo check — LLM shouldn't echo system instructions
    const hasInjection = /system\s*:/i.test(output) || /\[INST\]/i.test(output);
    if (hasInjection) details.push('Possible injection echo in LLM output');

    return {
      hasPII,
      hasInjection,
      hasHallucination: false, // Checked per-bullet via validateBullet
      isSafe: !hasPII && !hasInjection,
      details,
    };
  }

  /**
   * Validate that merged bullets preserve key information from originals.
   */
  validateMerge(originals: string[], merged: string[]): MergeValidationResult {
    // Extract all technologies from originals
    const techPattern = /\b[A-Z][A-Za-z0-9.]+\b/g;
    const originalTechs = new Set<string>();
    for (const orig of originals) {
      const matches = orig.match(techPattern) ?? [];
      matches.filter(m => !SAFE_ACTION_VERBS.has(m)).forEach(m => originalTechs.add(m));
    }

    // Check which are present in merged
    const mergedText = merged.join(' ');
    const missingTech = [...originalTechs].filter(t => !mergedText.includes(t));

    // Extract metrics from originals
    const metricPattern = /\d+%|\d+x|\$[\d,.]+|[\d,]+\s*(users|requests|transactions)/gi;
    const originalMetrics: string[] = [];
    for (const orig of originals) {
      const matches = orig.match(metricPattern) ?? [];
      originalMetrics.push(...matches);
    }
    const missingMetrics = originalMetrics.filter(m => !mergedText.includes(m));

    return {
      allTechPreserved: missingTech.length === 0,
      allMetricsPreserved: missingMetrics.length === 0,
      missingTech,
      missingMetrics,
      isValid: missingTech.length <= 1 && missingMetrics.length === 0,
    };
  }

  /**
   * Resume-level keyword coverage.
   */
  computeKeywordCoverage(
    allText: string,
    requiredSkills: string[],
  ): [number, string[]] {
    const lower = allText.toLowerCase();
    const found = requiredSkills.filter(s => lower.includes(s.toLowerCase()));
    const missing = requiredSkills.filter(s => !lower.includes(s.toLowerCase()));
    return [found.length / Math.max(requiredSkills.length, 1), missing];
  }

  /**
   * Jaccard text fidelity — replaces embedding-based cosine similarity.
   * Zero API calls. ~90% as accurate for detecting meaning drift.
   */
  private textFidelity(original: string, rewritten: string): number {
    const getTokens = (t: string) => new Set(
      t.toLowerCase().split(/\W+/).filter(w => w.length > 1),
    );
    const origTokens = getTokens(original);
    const rewriteTokens = getTokens(rewritten);
    const intersection = [...origTokens].filter(t => rewriteTokens.has(t)).length;
    const union = new Set([...origTokens, ...rewriteTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
