import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly model;
  private static readonly BACKOFF = [1000, 2000, 4000];

  constructor(private readonly config: ConfigService) {
    const genAI = new GoogleGenerativeAI(config.get<string>('GEMINI_API_KEY', ''));
    this.model = genAI.getGenerativeModel({
      model: config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash'),
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
      },
    });
  }

  async generateResponse(prompt: string, maxOutputTokens?: number): Promise<string> {
    for (let attempt = 0; attempt < GeminiService.BACKOFF.length; attempt++) {
      try {
        const result = await this.model.generateContent({
          contents: [{ parts: [{ text: prompt }], role: 'user' }],
          generationConfig: maxOutputTokens ? { temperature: 0, maxOutputTokens } : undefined,
        });
        return result.response.text();
      } catch (err: any) {
        const msg = (err?.message ?? '').toLowerCase();
        if (msg.includes('429') || msg.includes('quota')) throw err;
        if (attempt === GeminiService.BACKOFF.length - 1) throw err;
        this.logger.warn(`generateResponse attempt ${attempt + 1} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, GeminiService.BACKOFF[attempt]));
      }
    }
    throw new Error('generateResponse: unreachable');
  }
}
