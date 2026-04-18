import { Injectable, Logger } from '@nestjs/common';
import { BulletRecord } from '../models/profile.model';
import { JDExtraction } from '../models/jd-extraction.model';
import { GradedBullet } from '../models/pipeline-context.model';
import { EmbeddingService } from '../services/embedding.service';
import { cosineSimilarity } from '../utils/math';

/**
 * DOCUMENT GRADER AGENT — grades bullet relevance to JD.
 * Uses embedding-based pre-filtering (fast) then tech-overlap scoring.
 * Self-correcting: re-grades if scores look suspicious.
 */
@Injectable()
export class DocumentGraderAgent {
  private readonly logger = new Logger(DocumentGraderAgent.name);

  /**
   * Grade all bullets for relevance to the JD.
   * Returns top-N graded bullets sorted by relevance.
   */
  async gradeBullets(
    allBullets: BulletRecord[],
    jd: JDExtraction,
    topN: number,
    embeddingService: EmbeddingService,
  ): Promise<GradedBullet[]> {
    // Step 1: Embed JD and all bullets
    const jdText = [
      ...jd.requiredSkills,
      ...jd.preferredSkills,
      jd.domainContext,
      jd.seniority,
    ].join(' ');

    const jdEmbedding = await embeddingService.getEmbedding(jdText, 'RETRIEVAL_QUERY');
    const bulletTexts = allBullets.map(b => b.originalText);
    const bulletEmbeddings = await embeddingService.batchEmbed(bulletTexts, 'RETRIEVAL_DOCUMENT');

    // Step 2: Score each bullet
    const scored: GradedBullet[] = allBullets.map((bullet, i) => {
      const semanticScore = cosineSimilarity(jdEmbedding, bulletEmbeddings[i]);

      // Tech overlap bonus
      const techOverlap = bullet.techStack.filter(t =>
        jd.requiredSkills.some(r =>
          r.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(r.toLowerCase()),
        ),
      );

      const techBonus = Math.min(techOverlap.length * 0.05, 0.2);
      const relevanceScore = Math.min(semanticScore + techBonus, 1.0);

      // Generate reasoning
      const reasoning = this.generateReasoning(bullet, jd, techOverlap, semanticScore);

      return {
        bullet,
        relevanceScore,
        reasoning,
        suggestedKeywords: techOverlap.length > 0
          ? techOverlap
          : jd.requiredSkills.slice(0, 2),
      };
    });

    // Step 3: Filter and sort
    let graded = scored
      .filter(g => g.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Step 4: Self-correction check
    if (this.needsCorrection(graded, topN)) {
      this.logger.warn('Grading seems suspicious — applying correction');
      graded = this.correctGrading(graded, allBullets, jd);
    }

    const result = graded.slice(0, topN);
    this.logger.log(
      `Graded ${allBullets.length} bullets → top ${result.length}, ` +
      `avg score=${(result.reduce((s, g) => s + g.relevanceScore, 0) / result.length).toFixed(3)}`,
    );

    return result;
  }

  /**
   * Self-correction: detect if grading seems off.
   */
  private needsCorrection(graded: GradedBullet[], topN: number): boolean {
    if (graded.length < topN) return false;

    const topScores = graded.slice(0, topN).map(g => g.relevanceScore);
    const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;

    // All scores suspiciously high → likely not differentiating well
    if (avgScore > 0.95) return true;

    // All scores suspiciously low → embedding might have failed
    if (avgScore < 0.3) return true;

    // Very small spread → not differentiating
    const spread = Math.max(...topScores) - Math.min(...topScores);
    if (spread < 0.05 && topScores.length > 5) return true;

    return false;
  }

  /**
   * Correct grading by weighting tech overlap more heavily.
   */
  private correctGrading(
    graded: GradedBullet[],
    allBullets: BulletRecord[],
    jd: JDExtraction,
  ): GradedBullet[] {
    // Reweight with stronger tech overlap emphasis
    return graded.map(g => {
      const techOverlap = g.bullet.techStack.filter(t =>
        jd.requiredSkills.some(r =>
          r.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(r.toLowerCase()),
        ),
      ).length;

      // Stronger tech weight in correction mode
      const correctedScore = (g.relevanceScore * 0.5) + (Math.min(techOverlap / 3, 1.0) * 0.5);

      return { ...g, relevanceScore: correctedScore };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private generateReasoning(
    bullet: BulletRecord,
    jd: JDExtraction,
    techOverlap: string[],
    semanticScore: number,
  ): string {
    const parts: string[] = [];

    if (semanticScore > 0.7) parts.push('Strong semantic match');
    else if (semanticScore > 0.5) parts.push('Moderate semantic match');
    else parts.push('Weak semantic match');

    if (techOverlap.length > 0) {
      parts.push(`tech overlap: ${techOverlap.join(', ')}`);
    }

    if (bullet.sourceType === 'experience') {
      parts.push(`from ${bullet.companyOrProject} (${bullet.roleTitle})`);
    } else {
      parts.push(`project: ${bullet.companyOrProject}`);
    }

    return parts.join(' | ');
  }
}
