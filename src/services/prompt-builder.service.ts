import { Injectable } from '@nestjs/common';
import { JDExtraction } from '../models/jd-extraction.model';
import { BulletRecord } from '../models/profile.model';
import { RewriteExample } from './example-store.service';

@Injectable()
export class PromptBuilderService {

  buildJdExtractionPrompt(jdText: string): string {
    return `You are a job description parser. Extract structured data from the job description below.

Return ONLY a valid JSON object. No markdown. No explanation. No code fences.

Required shape:
{
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1"],
  "seniority": "Junior | Mid | Senior | Lead | Staff | Principal",
  "domainContext": "one sentence describing the domain",
  "companyContext": "one sentence describing the company or team"
}

JOB DESCRIPTION:
${jdText}`;
  }

  buildRewritePrompt(
    bullet: BulletRecord,
    jd: JDExtraction,
    examples: RewriteExample[],
    strict = false,
  ): string {
    const examplesBlock = this.buildExamplesBlock(examples);
    const strictWarning = strict
      ? `\nIMPORTANT: A previous rewrite attempt failed validation. Follow ALL rules strictly.\n`
      : '';

    return `You are a professional resume writer specializing in ATS optimization.
${strictWarning}
${examplesBlock}
=== YOUR TASK (use ONLY the technologies and facts in the bullet below) ===

Rules (ALL mandatory):
1. Preserve EVERY fact, metric, technology, and company name from the original bullet
2. Use terminology from the required skills list ONLY if the skill already exists in the original bullet
3. Do NOT introduce any technology, tool, or product not present in the original bullet — even if it appears in the style examples above
4. Start with a strong past-tense action verb: Built, Led, Designed, Architected, Delivered, Reduced, Increased, Migrated, Implemented, Optimized, Created, Managed, Deployed, Integrated, Automated, Improved, Launched, Refactored, Scaled, Owned, Drove
5. Maximum 220 characters — count carefully
6. No first-person pronouns (I, me, my, we, our)
7. Return ONLY the rewritten bullet — no explanation, no quotes, no punctuation changes

ORIGINAL BULLET (source of truth — all facts come from here):
${bullet.originalText}

ROLE CONTEXT (for terminology alignment only):
Required skills: ${jd.requiredSkills.join(', ')}
Seniority: ${jd.seniority}
Domain: ${jd.domainContext}

REWRITTEN BULLET:`;
  }

  buildSummaryPrompt(originalSummary: string, jd: JDExtraction): string {
    const topSkills = jd.requiredSkills.slice(0, 8).join(', ');
    return `You are a professional resume writer.

Rewrite the professional summary below to align with the target role.

Rules:
1. Reflect seniority level: ${jd.seniority}
2. Reflect domain: ${jd.domainContext}
3. Naturally incorporate these skills where truthful: ${topSkills}
4. Maximum 3 sentences
5. No first-person pronouns (I, me, my, we, our)
6. Return ONLY the rewritten summary — no explanation

ORIGINAL SUMMARY:
${originalSummary}

REWRITTEN SUMMARY:`;
  }

  private buildExamplesBlock(examples: RewriteExample[]): string {
    if (examples.length === 0) return '';

    const exampleLines = examples
      .map((e, i) => `Example ${i + 1}:
  Original:  ${e.originalBullet}
  Rewritten: ${e.rewrittenBullet}`)
      .join('\n\n');

    return `STYLE GUIDE — high-quality rewrite examples (STYLE ONLY — do NOT copy technologies):
${exampleLines}

`;
  }
}
