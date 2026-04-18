import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly embeddingModelName: string;
  private readonly embedCache = new Map<string, number[]>();
  private readonly chunkSize: number;

  private static readonly BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000];

  constructor(private readonly config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY', ''));
    this.embeddingModelName = this.config.get<string>(
      'GEMINI_EMBEDDING_MODEL',
      'models/gemini-embedding-001',
    );
    this.chunkSize = this.config.get<number>('EMBED_CHUNK_SIZE', 100);
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
  }

  private async embedSingle(text: string, taskType: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({ model: this.embeddingModelName });
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < EmbeddingService.BACKOFF_DELAYS.length; attempt++) {
      try {
        const result = await model.embedContent({
          content: { parts: [{ text }], role: 'user' },
          taskType: taskType as any,
        });
        return result.embedding.values;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`embedSingle attempt ${attempt + 1} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, EmbeddingService.BACKOFF_DELAYS[attempt]));
      }
    }
    throw new Error(`embedSingle failed: ${lastError}`);
  }

  private async embedBatchRaw(texts: string[], taskType: string): Promise<number[][]> {
    const model = this.genAI.getGenerativeModel({ model: this.embeddingModelName });
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < EmbeddingService.BACKOFF_DELAYS.length; attempt++) {
      try {
        const result = await (model as any).batchEmbedContents({
          requests: texts.map(text => ({
            content: { parts: [{ text }], role: 'user' },
            taskType: taskType as any,
          })),
        });
        return (result.embeddings as Array<{ values: number[] }>).map(e => e.values);
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`embedBatchRaw attempt ${attempt + 1} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, EmbeddingService.BACKOFF_DELAYS[attempt]));
      }
    }
    throw new Error(`embedBatchRaw failed: ${lastError}`);
  }

  async getEmbedding(text: string, taskType = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
    const hash = this.hashText(text);
    if (this.embedCache.has(hash)) return this.embedCache.get(hash)!;

    const embedding = await this.embedSingle(text, taskType);
    this.embedCache.set(hash, embedding);
    return embedding;
  }

  async batchEmbed(texts: string[], taskType = 'RETRIEVAL_DOCUMENT'): Promise<number[][]> {
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    const hashes = texts.map(t => this.hashText(t));

    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.embedCache.get(hashes[i]);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    if (uncachedTexts.length === 0) return results as number[][];

    for (let start = 0; start < uncachedTexts.length; start += this.chunkSize) {
      const chunkTexts = uncachedTexts.slice(start, start + this.chunkSize);
      const chunkIndices = uncachedIndices.slice(start, start + this.chunkSize);

      const embeddings = await this.embedBatchRaw(chunkTexts, taskType);

      for (let j = 0; j < chunkIndices.length; j++) {
        const globalIdx = chunkIndices[j];
        results[globalIdx] = embeddings[j];
        this.embedCache.set(hashes[globalIdx], embeddings[j]);
      }
    }

    return results as number[][];
  }
}
