import { PromptTemplate, BulletRewriteInput, BulletRewriteOutput } from '../prompt.types';

export const bulletRewriteV1: PromptTemplate<BulletRewriteInput, BulletRewriteOutput> = {
  id: 'bullet-rewrite',
  version: 1,
  name: 'Bullet Rewrite',
  description: 'Rewrites a single achievement bullet for ATS optimization.',
  maxTokens: 256,

  build(input: BulletRewriteInput): string {
    const strictWarning = input.strict
      ? `\nIMPORTANT: A previous rewrite attempt failed validation. Follow ALL rules strictly.\n`
      : '';

    return `You are a professional resume writer specializing in ATS optimization.
${strictWarning}
${input.examplesBlock}
=== YOUR TASK (use ONLY the technologies and facts in the bullet below) ===

Rules (ALL mandatory):
1. Preserve EVERY fact, metric, technology, and company name from the original bullet
2. Use terminology from the required skills list ONLY if the skill already exists in the original bullet
3. Do NOT introduce any technology, tool, or product not present in the original bullet — even if it appears in the style examples above
4. Start with a strong past-tense action verb: Built, Led, Designed, Architected, Delivered, Reduced, Increased, Migrated, Implemented, Optimized, Created, Managed, Deployed, Integrated, Automated, Improved, Launched, Refactored, Scaled, Owned, Drove
5. Maximum ${input.strict ? 170 : 170} characters — count carefully
6. No first-person pronouns (I, me, my, we, our)
7. Return ONLY the rewritten bullet — no explanation, no quotes, no punctuation changes

ORIGINAL BULLET (source of truth — all facts come from here):
${input.originalText}

ROLE CONTEXT (for terminology alignment only):
Required skills: ${input.requiredSkills.join(', ')}
Seniority: ${input.seniority}
Domain: ${input.domainContext}

REWRITTEN BULLET:`;
  },

  parseOutput(raw: string): BulletRewriteOutput {
    return { rewrittenText: raw.trim().replace(/^["']|["']$/g, '') };
  },
};
