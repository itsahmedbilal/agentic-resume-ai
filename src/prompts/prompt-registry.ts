import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplate, PromptSummary } from './prompt.types';

/**
 * Central prompt registry — all prompts registered here, looked up by ID.
 * Never hardcode prompt strings in service files.
 */
@Injectable()
export class PromptRegistry {
  private readonly logger = new Logger(PromptRegistry.name);
  private readonly registry = new Map<string, Map<number, PromptTemplate>>();

  /**
   * Register a prompt template. Newer versions override as default.
   */
  register<TInput, TOutput>(template: PromptTemplate<TInput, TOutput>): void {
    if (!this.registry.has(template.id)) {
      this.registry.set(template.id, new Map());
    }
    this.registry.get(template.id)!.set(template.version, template);
    this.logger.log(`Registered prompt: ${template.id} v${template.version}`);
  }

  /**
   * Get the latest version of a prompt by ID.
   */
  get<TInput = any, TOutput = any>(id: string): PromptTemplate<TInput, TOutput> {
    const versions = this.registry.get(id);
    if (!versions || versions.size === 0) {
      throw new Error(`Prompt not found: ${id}`);
    }
    const latestVersion = Math.max(...versions.keys());
    return versions.get(latestVersion)! as PromptTemplate<TInput, TOutput>;
  }

  /**
   * Get a specific version of a prompt.
   */
  getVersion<TInput = any, TOutput = any>(
    id: string,
    version: number,
  ): PromptTemplate<TInput, TOutput> {
    const versions = this.registry.get(id);
    if (!versions || !versions.has(version)) {
      throw new Error(`Prompt not found: ${id} v${version}`);
    }
    return versions.get(version)! as PromptTemplate<TInput, TOutput>;
  }

  /**
   * List all registered prompts with their metadata.
   */
  listAll(): PromptSummary[] {
    const summaries: PromptSummary[] = [];
    for (const [, versions] of this.registry) {
      const latestVersion = Math.max(...versions.keys());
      const template = versions.get(latestVersion)!;
      summaries.push({
        id: template.id,
        version: template.version,
        name: template.name,
        description: template.description,
        maxTokens: template.maxTokens,
      });
    }
    return summaries;
  }

  /**
   * Get count of registered prompts.
   */
  getCount(): number {
    return this.registry.size;
  }
}
