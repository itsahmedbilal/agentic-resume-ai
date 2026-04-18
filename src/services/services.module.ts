import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Infrastructure services (existing, reorganized)
import { GeminiService } from './gemini.service';
import { EmbeddingService } from './embedding.service';
import { ProfileLoaderService } from './profile-loader.service';
import { PdfGeneratorService } from './pdf-generator.service';

// New services
import { QueryRewriterService } from './query-rewriter.service';
import { RouterService } from './router.service';
import { SemanticCacheService } from './semantic-cache.service';
import { MemoryService } from './memory.service';
import { RagPipelineService } from './rag-pipeline.service';

// Agents
import { AgentsModule } from '../agents/agents.module';

// Prompts
import { PromptsModule } from '../prompts/prompts.module';

// Security
import { SecurityModule } from '../security/security.module';

// Observability
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [
    ConfigModule,
    AgentsModule,
    PromptsModule,
    SecurityModule,
    ObservabilityModule,
  ],
  providers: [
    // Infrastructure
    GeminiService,
    EmbeddingService,
    ProfileLoaderService,
    PdfGeneratorService,
    // New services
    QueryRewriterService,
    RouterService,
    SemanticCacheService,
    MemoryService,
    // Pipeline
    RagPipelineService,
  ],
  exports: [
    RagPipelineService,
    MemoryService,
    SemanticCacheService,
    ProfileLoaderService,
    GeminiService,
    EmbeddingService,
    PdfGeneratorService,
  ],
})
export class ServicesModule {}
