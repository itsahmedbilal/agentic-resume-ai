import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { JDExtraction } from '../models/jd-extraction.model';
import { cosineSimilarity } from '../utils/math';

export interface ValidationResult {
  gatesPassed: boolean;
  fidelityScore: number;
  keywordFound: boolean;
  hallucinationDetected: boolean;
  structurePass: boolean;
  confidenceScore: number;
  failReasons: string[];
}

const SAFE_ACTION_VERBS = new Set([
  'Developed','Built','Led','Designed','Architected','Delivered','Reduced',
  'Increased','Migrated','Implemented','Optimized','Created','Managed',
  'Deployed','Integrated','Automated','Improved','Established','Spearheaded',
  'Collaborated','Launched','Refactored','Maintained','Monitored','Configured',
  'Resolved','Streamlined','Accelerated','Enabled','Supported','Owned','Drove',
  'Scaled','Mentored','Reviewed','Evaluated','Modernized','Containerized',
  'Provisioned','Debugged','Tested','Shipped','Coordinated','Executed',
]);

const ACTION_VERB_RE = /^(Built|Led|Designed|Architected|Delivered|Reduced|Increased|Migrated|Implemented|Optimized|Created|Managed|Deployed|Integrated|Automated|Improved|Established|Spearheaded|Collaborated|Launched|Developed|Refactored|Maintained|Monitored|Configured|Resolved|Streamlined|Accelerated|Enabled|Supported|Owned|Drove|Scaled|Mentored|Reviewed|Evaluated|Modernized|Containerized|Provisioned|Debugged|Tested|Shipped)\b/;
const FIRST_PERSON_RE = /\b(I|me|my|we|our)\b/i;

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  async validate(
    original: string,
    rewritten: string,
    jd: JDExtraction,
    fidelityThreshold: number,
    allProfileTechTerms: Set<string>,
  ): Promise<ValidationResult> {
    const failReasons: string[] = [];

    // Gate 1 — Semantic Fidelity
    const origEmbed = await this.embeddingService.getEmbedding(original, 'RETRIEVAL_DOCUMENT');
    const rewriteEmbed = await this.embeddingService.getEmbedding(rewritten, 'RETRIEVAL_DOCUMENT');
    const fidelityScore = cosineSimilarity(origEmbed, rewriteEmbed);
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
      failReasons.push(`Gate 3: hallucinated terms detected: ${hallucinated.join(', ')}`);
    }

    // Gate 4 — Structure Rules
    const gate4 = (
      ACTION_VERB_RE.test(rewritten) &&
      rewritten.length <= 220 &&
      !FIRST_PERSON_RE.test(rewritten)
    );
    if (!ACTION_VERB_RE.test(rewritten)) failReasons.push('Gate 4: missing action verb');
    if (rewritten.length > 220) failReasons.push(`Gate 4: too long (${rewritten.length} chars)`);
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

  computeResumeKeywordCoverage(
    allText: string,
    requiredSkills: string[],
  ): [number, string[]] {
    const lower = allText.toLowerCase();
    const found = requiredSkills.filter(s => lower.includes(s.toLowerCase()));
    const missing = requiredSkills.filter(s => !lower.includes(s.toLowerCase()));
    return [found.length / Math.max(requiredSkills.length, 1), missing];
  }
}
