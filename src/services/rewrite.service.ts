import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ExampleStoreService } from './example-store.service';
import { ValidationService, ValidationResult } from './validation.service';
import { BulletRecord } from '../models/profile.model';
import { JDExtraction } from '../models/jd-extraction.model';

@Injectable()
export class RewriteService {
  private readonly logger = new Logger(RewriteService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly exampleStore: ExampleStoreService,
  ) {}

  async rewriteWithRetry(
    jd: JDExtraction,
    bullet: BulletRecord,
    validationService: ValidationService,
    fidelityThreshold: number,
    allProfileTechTerms: Set<string>,
  ): Promise<[string, ValidationResult]> {
    const examples = this.exampleStore.getRelevantExamples(jd.requiredSkills, 3);

    // Attempt 1
    const prompt1 = this.promptBuilder.buildRewritePrompt(bullet, jd, examples, false);
    const rewrite1 = await this.gemini.generateResponse(prompt1, 256);
    const validation1 = await validationService.validate(
      bullet.originalText, rewrite1, jd, fidelityThreshold, allProfileTechTerms,
    );

    if (validation1.gatesPassed) {
      return [rewrite1.trim(), validation1];
    }

    // Attempt 2 — strict mode
    const prompt2 = this.promptBuilder.buildRewritePrompt(bullet, jd, examples, true);
    const rewrite2 = await this.gemini.generateResponse(prompt2, 256);
    const validation2 = await validationService.validate(
      bullet.originalText, rewrite2, jd, fidelityThreshold, allProfileTechTerms,
    );

    if (validation2.gatesPassed) {
      return [rewrite2.trim(), validation2];
    }

    return [bullet.originalText, { ...validation2, confidenceScore: 0.0, gatesPassed: false }];
  }

  async generateSummary(originalSummary: string, jd: JDExtraction): Promise<string> {
    const prompt = this.promptBuilder.buildSummaryPrompt(originalSummary, jd);
    const result = await this.gemini.generateResponse(prompt, 512);
    return result.trim();
  }
}
