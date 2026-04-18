import { Module, OnModuleInit } from '@nestjs/common';
import { PromptRegistry } from './prompt-registry';
import { jdExtractionV1 } from './templates/jd-extraction.v1';
import { bulletRewriteV1 } from './templates/bullet-rewrite.v1';
import { bulletMergeV1 } from './templates/bullet-merge.v1';
import { summaryRewriteV1 } from './templates/summary-rewrite.v1';
import { documentGradingV1 } from './templates/document-grading.v1';
import { jdDecompositionV1 } from './templates/jd-decomposition.v1';

@Module({
  providers: [PromptRegistry],
  exports: [PromptRegistry],
})
export class PromptsModule implements OnModuleInit {
  constructor(private readonly registry: PromptRegistry) {}

  onModuleInit() {
    // Register all prompt templates at startup
    this.registry.register(jdExtractionV1);
    this.registry.register(bulletRewriteV1);
    this.registry.register(bulletMergeV1);
    this.registry.register(summaryRewriteV1);
    this.registry.register(documentGradingV1);
    this.registry.register(jdDecompositionV1);
  }
}
