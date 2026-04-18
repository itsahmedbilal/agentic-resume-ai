import { PromptTemplate, SummaryRewriteInput, SummaryRewriteOutput } from '../prompt.types';

export const summaryRewriteV1: PromptTemplate<SummaryRewriteInput, SummaryRewriteOutput> = {
  id: 'summary-rewrite',
  version: 1,
  name: 'Summary Rewrite',
  description: 'Rewrites the professional summary to align with the target role.',
  maxTokens: 512,

  build(input: SummaryRewriteInput): string {
    const topSkills = input.topSkills.slice(0, 8).join(', ');
    return `You are a professional resume writer.

Rewrite the professional summary below to align with the target role.

Rules:
1. Reflect seniority level: ${input.seniority}
2. Reflect domain: ${input.domainContext}
3. Naturally incorporate these skills where truthful: ${topSkills}
4. Maximum 2 sentences — be dense and impactful
5. No first-person pronouns (I, me, my, we, our)
6. Return ONLY the rewritten summary — no explanation

ORIGINAL SUMMARY:
${input.originalSummary}

REWRITTEN SUMMARY:`;
  },

  parseOutput(raw: string): SummaryRewriteOutput {
    return { rewrittenSummary: raw.trim().replace(/^["']|["']$/g, '') };
  },
};
