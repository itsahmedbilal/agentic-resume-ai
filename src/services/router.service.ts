import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineStrategy, RewrittenQuery } from '../models/pipeline-context.model';
import { MasterProfile, flatSkills } from '../models/profile.model';

/**
 * ROUTER SERVICE — routes to different pipeline strategies based on JD complexity.
 * Simple JDs get fast treatment (fewer API calls), complex JDs get deep treatment.
 */
@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private readonly config: ConfigService) {}

  route(query: RewrittenQuery, profile: MasterProfile): PipelineStrategy {
    const profileSkills = flatSkills(profile).map(s => s.toLowerCase());
    const jdSkills = query.expandedSkills.map(s => s.toLowerCase());

    // Calculate profile-JD skill overlap
    const overlap = jdSkills.filter(s =>
      profileSkills.some(ps =>
        ps.includes(s) || s.includes(ps),
      ),
    ).length;

    const overlapRatio = jdSkills.length > 0 ? overlap / jdSkills.length : 0;

    if (query.complexity === 'simple' || overlapRatio > 0.7) {
      this.logger.log(`Strategy: FAST (overlap=${(overlapRatio * 100).toFixed(0)}%, complexity=${query.complexity})`);
      return {
        type: 'fast',
        topN: 6,
        merge: true,
        retries: 0,
        concurrency: 1,
        maxBulletsPerRole: 3,
        maxProjects: 2,
        maxBulletChars: 170,
        reason: `High overlap (${(overlapRatio * 100).toFixed(0)}%) or simple JD`,
      };
    }

    if (query.complexity === 'complex' || overlapRatio < 0.3) {
      this.logger.log(`Strategy: DEEP (overlap=${(overlapRatio * 100).toFixed(0)}%, complexity=${query.complexity})`);
      return {
        type: 'deep',
        topN: 10,
        merge: true,
        retries: 1,
        concurrency: 2,
        maxBulletsPerRole: 4,
        maxProjects: 3,
        maxBulletChars: 170,
        reason: `Low overlap (${(overlapRatio * 100).toFixed(0)}%) or complex JD`,
      };
    }

    this.logger.log(`Strategy: STANDARD (overlap=${(overlapRatio * 100).toFixed(0)}%, complexity=${query.complexity})`);
    return {
      type: 'standard',
      topN: 8,
      merge: true,
      retries: 0,
      concurrency: 2,
      maxBulletsPerRole: 3,
      maxProjects: 2,
      maxBulletChars: 170,
      reason: `Moderate overlap (${(overlapRatio * 100).toFixed(0)}%)`,
    };
  }
}
