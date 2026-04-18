import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { BulletRecord } from '../models/profile.model';
import { cosineSimilarity } from '../utils/math';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  async getTopBullets(
    jdText: string,
    allBullets: BulletRecord[],
    topN: number,
    requiredSkills: string[],
  ): Promise<[BulletRecord, number][]> {
    const jdEmbedding = await this.embeddingService.getEmbedding(jdText, 'RETRIEVAL_QUERY');

    const bulletEmbeddings = await this.embeddingService.batchEmbed(
      allBullets.map(b => b.originalText),
      'RETRIEVAL_DOCUMENT',
    );

    const scored = allBullets.map((bullet, i) => {
      const sim = cosineSimilarity(jdEmbedding, bulletEmbeddings[i]);
      const techOverlap = bullet.techStack.filter(t =>
        requiredSkills.some(r =>
          r.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(r.toLowerCase()),
        ),
      ).length;
      const score = (techOverlap === 0 && sim < 0.70) ? -1 : sim;
      return [bullet, score] as [BulletRecord, number];
    });

    return scored
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
  }
}
