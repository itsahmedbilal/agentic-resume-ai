import { Module } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ServicesModule } from '../services/services.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [ServicesModule, EvaluationModule, ObservabilityModule],
  controllers: [ResumeController],
})
export class ResumeModule {}
