import { Module } from '@nestjs/common';
import { DecomposerAgent } from './decomposer.agent';
import { DocumentGraderAgent } from './document-grader.agent';
import { AdaptiveRouterAgent } from './adaptive-router.agent';

@Module({
  providers: [DecomposerAgent, DocumentGraderAgent, AdaptiveRouterAgent],
  exports: [DecomposerAgent, DocumentGraderAgent, AdaptiveRouterAgent],
})
export class AgentsModule {}
