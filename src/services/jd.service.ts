import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';
import { JDExtraction } from '../models/jd-extraction.model';

@Injectable()
export class JdService {
  private readonly logger = new Logger(JdService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async extractContext(jdText: string): Promise<JDExtraction> {
    const prompt = this.promptBuilder.buildJdExtractionPrompt(jdText);

    try {
      const raw = await this.gemini.generateResponse(prompt);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned) as JDExtraction;
    } catch (err: any) {
      this.logger.error(`JD extraction failed: ${err.message}`);
      return {
        requiredSkills: [],
        preferredSkills: [],
        seniority: 'Senior',
        domainContext: '',
        companyContext: '',
      };
    }
  }
}
