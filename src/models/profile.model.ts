import { createHash } from 'crypto';

export interface MasterProfile {
  name: string;
  title: string;
  summary: string;
  contact: {
    email: string;
    phone: string;
    linkedin: string;
    github: string;
    location: string;
  };
  skills: {
    languages: string[];
    frameworks: string[];
    tools: string[];
    cloud: string[];
    databases: string[];
  };
  experience: Array<{
    company: string;
    title: string;
    duration: string;
    techStack: string[];
    achievements: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    achievements: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    year: string;
  }>;
}

export interface BulletRecord {
  id: string;
  originalText: string;
  sourceType: 'experience' | 'project';
  roleTitle: string;
  companyOrProject: string;
  techStack: string[];
}

export function flattenBullets(profile: MasterProfile): BulletRecord[] {
  const bullets: BulletRecord[] = [];

  for (const exp of profile.experience) {
    for (const achievement of exp.achievements) {
      bullets.push({
        id: createHash('sha256').update(achievement).digest('hex'),
        originalText: achievement,
        sourceType: 'experience',
        roleTitle: exp.title,
        companyOrProject: exp.company,
        techStack: exp.techStack,
      });
    }
  }

  for (const proj of profile.projects) {
    for (const achievement of proj.achievements) {
      bullets.push({
        id: createHash('sha256').update(achievement).digest('hex'),
        originalText: achievement,
        sourceType: 'project',
        roleTitle: proj.name,
        companyOrProject: proj.name,
        techStack: proj.techStack,
      });
    }
  }

  return bullets;
}

export function flatSkills(p: MasterProfile): string[] {
  const s = p.skills;
  return [...s.languages, ...s.frameworks, ...s.tools, ...s.cloud, ...s.databases];
}
