import { PromptTemplate, JdDecompositionInput } from '../prompt.types';
import { JDDecomposition, DecomposedRequirement } from '../../models/pipeline-context.model';

export const jdDecompositionV1: PromptTemplate<JdDecompositionInput, JDDecomposition> = {
  id: 'jd-decomposition',
  version: 1,
  name: 'JD Decomposition',
  description: 'Decomposes JD extraction into categorized sub-requirements. Rule-based, no LLM needed.',
  maxTokens: 0, // No LLM call — rule-based

  build(_input: JdDecompositionInput): string {
    // This prompt is not used — decomposition is rule-based
    return '';
  },

  parseOutput(_raw: string): JDDecomposition {
    return { coreRequirements: [], secondaryRequirements: [], domainContext: '', senioritySignals: [], culturalSignals: [] };
  },
};

/**
 * Rule-based JD decomposition — no LLM call needed.
 * Categorizes skills from JDExtraction into structured sub-requirements.
 */
export function decomposeJd(input: JdDecompositionInput): JDDecomposition {
  const FRONTEND_SKILLS = new Set([
    'react', 'angular', 'vue', 'next.js', 'nextjs', 'svelte', 'redux', 'rxjs',
    'tailwind', 'css', 'html', 'sass', 'scss', 'webpack', 'vite', 'gatsby',
    'ngrx', 'bootstrap', 'material-ui', 'mui', 'figma', 'storybook',
  ]);

  const BACKEND_SKILLS = new Set([
    'node.js', 'nodejs', 'express', 'nestjs', 'fastapi', 'django', 'flask',
    'spring', 'graphql', 'rest', 'api', 'microservices', 'grpc',
  ]);

  const INFRA_SKILLS = new Set([
    'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins',
    'terraform', 'ansible', 'nginx', 'linux', 'cloudformation',
  ]);

  const DATA_SKILLS = new Set([
    'mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'elasticsearch',
    'kafka', 'rabbitmq', 'solace', 'bullmq', 'prisma', 'sequelize', 'sql', 'mssql',
  ]);

  function categorize(skill: string): DecomposedRequirement['category'] {
    const lower = skill.toLowerCase();
    if (FRONTEND_SKILLS.has(lower)) return 'frontend';
    if (BACKEND_SKILLS.has(lower)) return 'backend';
    if (INFRA_SKILLS.has(lower)) return 'infrastructure';
    if (DATA_SKILLS.has(lower)) return 'data';
    return 'other';
  }

  const coreRequirements: DecomposedRequirement[] = input.requiredSkills.map(skill => ({
    skill,
    importance: 'must-have' as const,
    category: categorize(skill),
  }));

  const secondaryRequirements: DecomposedRequirement[] = input.preferredSkills.map(skill => ({
    skill,
    importance: 'nice-to-have' as const,
    category: categorize(skill),
  }));

  const SENIORITY_SIGNALS = [
    'lead', 'mentor', 'architect', 'own', 'drive', 'strategy',
    'principal', 'staff', 'senior', 'code review',
  ];

  const CULTURE_SIGNALS = [
    'collaborative', 'fast-paced', 'agile', 'startup', 'remote',
    'cross-functional', 'team', 'inclusive',
  ];

  const contextLower = (input.domainContext + ' ' + input.seniority).toLowerCase();

  return {
    coreRequirements,
    secondaryRequirements,
    domainContext: input.domainContext,
    senioritySignals: SENIORITY_SIGNALS.filter(s => contextLower.includes(s)),
    culturalSignals: CULTURE_SIGNALS.filter(s => contextLower.includes(s)),
  };
}
