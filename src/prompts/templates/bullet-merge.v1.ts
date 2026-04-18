import { PromptTemplate, BulletMergeInput, BulletMergeOutput } from '../prompt.types';

export const bulletMergeV1: PromptTemplate<BulletMergeInput, BulletMergeOutput> = {
  id: 'bullet-merge',
  version: 1,
  name: 'Bullet Merge',
  description: 'Merges multiple achievement bullets into fewer, denser bullets while preserving all key facts.',
  maxTokens: 1024,

  build(input: BulletMergeInput): string {
    return `You are a professional resume compressor. Your job is precision condensation.

Merge these ${input.bullets.length} achievement bullets into exactly ${input.maxOutputBullets} dense bullets.

MANDATORY RULES:
1. Preserve ALL technologies, tools, and frameworks mentioned across the original bullets
2. Preserve ALL quantified metrics (percentages, counts, time savings)
3. Each output bullet MUST be under ${input.maxCharsPerBullet} characters
4. Each output bullet MUST start with a past-tense action verb
5. Combine related responsibilities naturally — don't just concatenate
6. Prioritize these JD skills if they appear in the originals: ${input.requiredSkills.join(', ')}
7. No first-person pronouns (I, me, my, we, our)

INPUT BULLETS:
${input.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Return ONLY a JSON array of exactly ${input.maxOutputBullets} strings. No explanation. No code fences.
Example: ["Merged bullet 1...", "Merged bullet 2..."]`;
  },

  parseOutput(raw: string): BulletMergeOutput {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return { mergedBullets: parsed.map((b: any) => String(b).trim()) };
      }
      return { mergedBullets: [] };
    } catch {
      // Fallback: try to extract strings from the response
      const matches = cleaned.match(/"([^"]+)"/g);
      if (matches) {
        return { mergedBullets: matches.map(m => m.replace(/^"|"$/g, '').trim()) };
      }
      return { mergedBullets: [] };
    }
  },
};
