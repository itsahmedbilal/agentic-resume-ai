import { Injectable, Logger } from '@nestjs/common';
import { JDExtraction } from '../models/jd-extraction.model';
import { JDDecomposition, DecomposedRequirement } from '../models/pipeline-context.model';

/**
 * DECOMPOSER AGENT — breaks JD into structured sub-requirements.
 * Rule-based, zero LLM calls. Categorizes skills by domain.
 */

const SKILL_CATEGORIES: Record<string, Set<string>> = {
  frontend: new Set([
    'react', 'angular', 'vue', 'next.js', 'nextjs', 'svelte', 'redux', 'rxjs',
    'tailwind', 'css', 'html', 'sass', 'scss', 'webpack', 'vite', 'ngrx',
    'bootstrap', 'material-ui', 'storybook', 'figma', 'responsive', 'accessibility',
    'tailwind css', 'mui', 'gatsby', 'nuxt',
  ]),
  backend: new Set([
    'node.js', 'nodejs', 'express', 'nestjs', 'fastapi', 'django', 'flask',
    'spring', 'graphql', 'rest', 'api', 'microservices', 'grpc', 'oauth',
    'jwt', 'websocket', 'server-side', 'middleware',
  ]),
  infrastructure: new Set([
    'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins',
    'terraform', 'ansible', 'nginx', 'linux', 'cloudformation', 'devops',
    'monitoring', 'logging', 'helm', 'argo',
  ]),
  data: new Set([
    'mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'elasticsearch',
    'kafka', 'rabbitmq', 'solace', 'bullmq', 'prisma', 'sequelize', 'sql',
    'mssql', 'dynamodb', 'cassandra', 'sqlite',
  ]),
};

@Injectable()
export class DecomposerAgent {
  private readonly logger = new Logger(DecomposerAgent.name);

  decompose(jd: JDExtraction): JDDecomposition {
    const coreRequirements = jd.requiredSkills.map(skill => this.categorizeSkill(skill, 'must-have'));
    const secondaryRequirements = jd.preferredSkills.map(skill => this.categorizeSkill(skill, 'nice-to-have'));

    // Extract seniority signals from context
    const contextText = `${jd.seniority} ${jd.domainContext} ${jd.companyContext}`.toLowerCase();
    const senioritySignals = this.extractSignals(contextText, [
      'lead', 'mentor', 'architect', 'own', 'drive', 'strategy',
      'principal', 'staff', 'senior', 'code review', 'technical direction',
    ]);

    const culturalSignals = this.extractSignals(contextText, [
      'collaborative', 'fast-paced', 'agile', 'startup', 'remote',
      'cross-functional', 'team', 'inclusive', 'innovative',
    ]);

    this.logger.log(
      `Decomposed: ${coreRequirements.length} core, ${secondaryRequirements.length} secondary, ` +
      `${senioritySignals.length} seniority signals`,
    );

    return {
      coreRequirements,
      secondaryRequirements,
      domainContext: jd.domainContext,
      senioritySignals,
      culturalSignals,
    };
  }

  private categorizeSkill(
    skill: string,
    importance: 'must-have' | 'nice-to-have',
  ): DecomposedRequirement {
    const lower = skill.toLowerCase();

    for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
      if (skills.has(lower)) {
        return { skill, importance, category: category as DecomposedRequirement['category'] };
      }
    }

    // Check for soft skills
    const softSkillPatterns = /\b(communication|leadership|problem.solving|teamwork|agile|scrum)\b/i;
    if (softSkillPatterns.test(skill)) {
      return { skill, importance, category: 'soft-skill' };
    }

    return { skill, importance, category: 'other' };
  }

  private extractSignals(text: string, signals: string[]): string[] {
    return signals.filter(s => text.includes(s));
  }
}
