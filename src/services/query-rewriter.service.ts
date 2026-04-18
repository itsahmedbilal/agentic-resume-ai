import { Injectable, Logger } from '@nestjs/common';
import { RewrittenQuery } from '../models/pipeline-context.model';

/**
 * QUERY REWRITER — normalizes and expands JD text before processing.
 * Zero LLM calls — uses local synonym dictionary + regex.
 */

// Tech synonym dictionary — normalizes different spellings to canonical forms
const SYNONYMS: Record<string, string[]> = {
  'React': ['React', 'React.js', 'ReactJS', 'react'],
  'Node.js': ['Node.js', 'NodeJS', 'Node', 'node.js'],
  'Next.js': ['Next.js', 'NextJS', 'Next', 'Nextjs'],
  'Angular': ['Angular', 'AngularJS', 'Angular.js'],
  'TypeScript': ['TypeScript', 'TS', 'Typescript'],
  'JavaScript': ['JavaScript', 'JS', 'Javascript', 'ECMAScript'],
  'MongoDB': ['MongoDB', 'Mongo', 'mongo'],
  'PostgreSQL': ['PostgreSQL', 'Postgres', 'psql', 'PG'],
  'Redis': ['Redis', 'redis'],
  'Docker': ['Docker', 'docker', 'Containerization'],
  'Kubernetes': ['Kubernetes', 'K8s', 'k8s'],
  'AWS': ['AWS', 'Amazon Web Services'],
  'Azure': ['Azure', 'Microsoft Azure'],
  'GCP': ['GCP', 'Google Cloud', 'Google Cloud Platform'],
  'GraphQL': ['GraphQL', 'graphql', 'GQL'],
  'REST': ['REST', 'RESTful', 'REST API', 'REST APIs'],
  'Express': ['Express', 'Express.js', 'ExpressJS'],
  'FastAPI': ['FastAPI', 'fastapi'],
  'Python': ['Python', 'python', 'Python3'],
  'NestJS': ['NestJS', 'Nest.js', 'Nest'],
  'Redux': ['Redux', 'Redux Toolkit', 'RTK'],
  'RxJS': ['RxJS', 'rxjs', 'Reactive Extensions'],
  'CI/CD': ['CI/CD', 'CICD', 'Continuous Integration', 'Continuous Deployment'],
  'Microservices': ['Microservices', 'microservices', 'micro-services'],
  'Jest': ['Jest', 'jest'],
  'Cypress': ['Cypress', 'cypress'],
  'Tailwind': ['Tailwind', 'Tailwind CSS', 'TailwindCSS'],
  'BullMQ': ['BullMQ', 'Bull', 'bull'],
  'Solace': ['Solace', 'solace', 'Solace PubSub'],
};

// Skill inference map — if a JD mentions X, they likely also value Y
const INFERRED_SKILLS: Record<string, string[]> = {
  'microservices': ['Docker', 'API Design', 'Event-Driven Architecture'],
  'full-stack': ['Frontend', 'Backend', 'REST API'],
  'cloud native': ['Docker', 'Kubernetes', 'CI/CD'],
  'event-driven': ['Message Queues', 'Pub/Sub', 'Async Processing'],
  'scalable': ['Caching', 'Load Balancing', 'Performance Optimization'],
  'devops': ['CI/CD', 'Docker', 'Infrastructure as Code'],
  'real-time': ['WebSocket', 'Event Streaming', 'Low Latency'],
};

// Domain detection patterns
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; domain: string }> = [
  { pattern: /\b(fintech|banking|financial|payment|trading)\b/i, domain: 'fintech' },
  { pattern: /\b(health|medical|clinical|pharma|biotech)\b/i, domain: 'healthcare' },
  { pattern: /\b(e-?commerce|retail|marketplace|shop)\b/i, domain: 'e-commerce' },
  { pattern: /\b(saas|b2b|platform|enterprise)\b/i, domain: 'saas' },
  { pattern: /\b(edtech|education|learning|lms)\b/i, domain: 'edtech' },
  { pattern: /\b(telecom|mobile|wireless|5g)\b/i, domain: 'telecom' },
  { pattern: /\b(ai|machine learning|ml|llm|nlp|deep learning)\b/i, domain: 'ai-ml' },
  { pattern: /\b(gaming|game|metaverse|ar|vr)\b/i, domain: 'gaming' },
  { pattern: /\b(cyber|security|infosec|compliance)\b/i, domain: 'cybersecurity' },
];

@Injectable()
export class QueryRewriterService {
  private readonly logger = new Logger(QueryRewriterService.name);

  rewrite(rawJdText: string): RewrittenQuery {
    const normalizedText = this.normalizeText(rawJdText);

    // Build synonym map for found skills
    const synonymMap = new Map<string, string[]>();
    const expandedSkills: string[] = [];

    for (const [canonical, variants] of Object.entries(SYNONYMS)) {
      const found = variants.some(v =>
        normalizedText.toLowerCase().includes(v.toLowerCase()),
      );
      if (found) {
        synonymMap.set(canonical, variants);
        expandedSkills.push(...variants);
      }
    }

    // Infer related skills
    const inferredSkills: string[] = [];
    for (const [trigger, inferred] of Object.entries(INFERRED_SKILLS)) {
      if (normalizedText.toLowerCase().includes(trigger)) {
        inferredSkills.push(...inferred);
      }
    }

    // Detect domain
    let jdDomain = 'general';
    for (const { pattern, domain } of DOMAIN_PATTERNS) {
      if (pattern.test(normalizedText)) {
        jdDomain = domain;
        break;
      }
    }

    // Assess complexity
    const complexity = this.assessComplexity(normalizedText, expandedSkills);

    this.logger.log(
      `Query rewritten: ${expandedSkills.length} skills expanded, ` +
      `${inferredSkills.length} inferred, domain=${jdDomain}, complexity=${complexity}`,
    );

    return {
      normalizedText,
      expandedSkills: [...new Set(expandedSkills)],
      inferredSkills: [...new Set(inferredSkills)],
      complexity,
      jdDomain,
      synonymMap,
    };
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/•/g, '-')
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .trim();
  }

  private assessComplexity(
    text: string,
    skills: string[],
  ): 'simple' | 'moderate' | 'complex' {
    const wordCount = text.split(/\s+/).length;
    const skillCount = skills.length;

    // Simple: short JD with few skills
    if (wordCount < 150 && skillCount < 8) return 'simple';
    // Complex: long JD with many skills or multiple domains
    if (wordCount > 400 || skillCount > 20) return 'complex';
    return 'moderate';
  }
}
