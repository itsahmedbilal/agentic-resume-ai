import { Injectable, Logger } from '@nestjs/common';
import { MasterProfile, flatSkills } from '../models/profile.model';
import { PipelineStrategy, RewrittenQuery } from '../models/pipeline-context.model';
import { DomainInsight } from '../services/memory.service';

/**
 * ADAPTIVE ROUTER AGENT — dynamically adjusts pipeline strategy
 * based on profile-JD fit analysis and memory from past runs.
 * Self-correcting: learns from past domain performance.
 */
@Injectable()
export class AdaptiveRouterAgent {
  private readonly logger = new Logger(AdaptiveRouterAgent.name);

  decide(
    profile: MasterProfile,
    query: RewrittenQuery,
    domainInsight: DomainInsight | null,
    baseStrategy: PipelineStrategy,
  ): PipelineStrategy {
    let strategy = { ...baseStrategy };

    // Adaptation 1: If we have memory of this domain, use best strategy
    if (domainInsight && domainInsight.totalRuns >= 3) {
      this.logger.log(
        `Domain insight: ${domainInsight.domain} — ` +
        `${domainInsight.totalRuns} runs, best strategy=${domainInsight.bestStrategy}, ` +
        `avg coverage=${(domainInsight.avgKeywordCoverage * 100).toFixed(0)}%`,
      );

      // Override strategy type from domain memory
      if (domainInsight.bestStrategy === 'fast' && strategy.type !== 'fast') {
        strategy.type = 'fast';
        strategy.topN = 6;
        strategy.retries = 0;
        strategy.reason = `Domain memory: ${domainInsight.domain} works best with fast strategy`;
      } else if (domainInsight.bestStrategy === 'deep' && strategy.type === 'fast') {
        strategy.type = 'standard';
        strategy.topN = 8;
        strategy.reason = `Domain memory: ${domainInsight.domain} needs more depth`;
      }

      // If past coverage was poor, increase effort
      if (domainInsight.avgKeywordCoverage < 0.5 && strategy.type !== 'deep') {
        strategy.type = 'deep';
        strategy.topN = 10;
        strategy.retries = 1;
        strategy.reason = `Low past coverage (${(domainInsight.avgKeywordCoverage * 100).toFixed(0)}%) — increasing effort`;
      }
    }

    // Adaptation 2: Profile size awareness
    const totalBullets = profile.experience.reduce((s, e) => s + e.achievements.length, 0) +
                         profile.projects.reduce((s, p) => s + p.achievements.length, 0);

    if (totalBullets < 10) {
      // Small profile — don't over-filter
      strategy.topN = Math.min(strategy.topN, totalBullets);
      strategy.maxBulletsPerRole = Math.min(strategy.maxBulletsPerRole, 4);
      strategy.merge = totalBullets > 6; // Only merge if enough bullets
    }

    // Adaptation 3: Skill coverage check
    const profileSkills = new Set(flatSkills(profile).map(s => s.toLowerCase()));
    const jdSkills = query.expandedSkills.map(s => s.toLowerCase());
    const coveredSkills = jdSkills.filter(s =>
      [...profileSkills].some(ps => ps.includes(s) || s.includes(ps)),
    );
    const coverageRatio = jdSkills.length > 0 ? coveredSkills.length / jdSkills.length : 0;

    if (coverageRatio < 0.3) {
      this.logger.warn(
        `Low skill coverage (${(coverageRatio * 100).toFixed(0)}%) — ` +
        `profile may not be a great fit for this JD`,
      );
    }

    this.logger.log(
      `Adaptive decision: ${strategy.type} (topN=${strategy.topN}, merge=${strategy.merge}) — ${strategy.reason}`,
    );

    return strategy;
  }
}
