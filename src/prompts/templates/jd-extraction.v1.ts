import { PromptTemplate, JdExtractionInput, JdExtractionOutput } from '../prompt.types';

export const jdExtractionV1: PromptTemplate<JdExtractionInput, JdExtractionOutput> = {
  id: 'jd-extraction',
  version: 1,
  name: 'JD Extraction',
  description: 'Extracts structured fields from a raw job description text.',
  maxTokens: 1024,

  build(input: JdExtractionInput): string {
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
${input.jdText}`;
  },

  parseOutput(raw: string): JdExtractionOutput {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        requiredSkills: parsed.requiredSkills ?? [],
        preferredSkills: parsed.preferredSkills ?? [],
        seniority: parsed.seniority ?? 'Senior',
        domainContext: parsed.domainContext ?? '',
        companyContext: parsed.companyContext ?? '',
      };
    } catch {
      return {
        requiredSkills: [],
        preferredSkills: [],
        seniority: 'Senior',
        domainContext: '',
        companyContext: '',
      };
    }
  },
};
