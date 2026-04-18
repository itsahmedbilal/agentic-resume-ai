import { PromptTemplate, DocumentGradingInput, DocumentGradingOutput } from '../prompt.types';

export const documentGradingV1: PromptTemplate<DocumentGradingInput, DocumentGradingOutput> = {
  id: 'document-grading',
  version: 1,
  name: 'Document Grading',
  description: 'Grades bullet relevance to a JD with reasoning — replaces simple cosine ranking.',
  maxTokens: 2048,

  build(input: DocumentGradingInput): string {
    const bulletsBlock = input.bullets
      .map(b => `[${b.index}] (${b.role}) ${b.text}`)
      .join('\n');

    return `You are a resume relevance grader. Score each bullet's relevance to this job.

JOB REQUIREMENTS:
- Required skills: ${input.requiredSkills.join(', ')}
- Preferred skills: ${input.preferredSkills.join(', ')}
- Seniority: ${input.seniority}

CANDIDATE BULLETS:
${bulletsBlock}

Score each bullet 0.0-1.0 for relevance. Select the top ${input.topN} most relevant.

Return ONLY a JSON object. No explanation. No code fences.
{
  "graded": [
    {"index": 1, "score": 0.85, "reasoning": "why relevant", "suggestedKeywords": ["React", "Node.js"]},
    ...
  ]
}

Return exactly ${input.topN} entries, sorted by score descending.`;
  },

  parseOutput(raw: string): DocumentGradingOutput {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        graded: (parsed.graded ?? []).map((g: any) => ({
          index: g.index ?? 0,
          score: g.score ?? 0,
          reasoning: g.reasoning ?? '',
          suggestedKeywords: g.suggestedKeywords ?? [],
        })),
      };
    } catch {
      return { graded: [] };
    }
  },
};
