import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { GenerateResumeRequestDto } from './dto/generate-resume-request.dto';
import { RagPipelineService } from '../services/rag-pipeline.service';
import { MemoryService } from '../services/memory.service';
import { SemanticCacheService } from '../services/semantic-cache.service';
import { FeedbackService, UserFeedback } from '../observability/feedback.service';
import { CostTrackerService } from '../observability/cost-tracker.service';
import { OnlineMonitorService } from '../evaluation/online-monitor.service';
import { OfflineEvalService } from '../evaluation/offline-eval.service';

@Controller('api/v1')
export class ResumeController {
  constructor(
    private readonly pipeline: RagPipelineService,
    private readonly memory: MemoryService,
    private readonly semanticCache: SemanticCacheService,
    private readonly feedback: FeedbackService,
    private readonly costTracker: CostTrackerService,
    private readonly onlineMonitor: OnlineMonitorService,
    private readonly offlineEval: OfflineEvalService,
  ) {}

  // ── Core Endpoints ─────────────────────────────────────────

  @Post('generate-resume')
  async generateResume(@Body() dto: GenerateResumeRequestDto) {
    try {
      return await this.pipeline.execute(dto.jdText, dto.topNBullets, dto.fidelityThreshold);
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('blocked by security'))
        throw new HttpException('Input blocked by security guard', HttpStatus.BAD_REQUEST);
      if (msg.includes('429') || msg.includes('quota'))
        throw new HttpException('Gemini quota exceeded — try again later', HttpStatus.TOO_MANY_REQUESTS);
      if (msg.includes('not found') || msg.includes('404'))
        throw new HttpException('Gemini model not found', HttpStatus.SERVICE_UNAVAILABLE);
      throw new HttpException(err.message ?? 'Internal error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ── Memory / Examples ──────────────────────────────────────

  @Get('examples/stats')
  getExampleStats() {
    const memStats = this.memory.getMemoryStats();
    const cacheStats = this.semanticCache.getStats();
    return {
      totalExamples: memStats.totalExamples,
      totalRuns: memStats.totalRuns,
      domains: memStats.domains,
      minConfidenceThreshold: 0.90,
      cache: cacheStats,
      description: 'High-confidence rewrite examples used for few-shot prompting',
    };
  }

  // ── Feedback ───────────────────────────────────────────────

  @Post('feedback/:runId')
  submitFeedback(
    @Param('runId') runId: string,
    @Body() feedback: UserFeedback,
  ) {
    this.feedback.submitFeedback(runId, feedback);
    return { status: 'saved', runId };
  }

  // ── Evaluation ─────────────────────────────────────────────

  @Post('eval/run')
  async runEvaluation() {
    try {
      return await this.offlineEval.runEvaluation();
    } catch (err: any) {
      throw new HttpException(`Evaluation failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ── Observability ──────────────────────────────────────────

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: this.memory.getMemoryStats(),
      cache: this.semanticCache.getStats(),
    };
  }

  @Get('observability/cost')
  getCostStats() {
    return this.costTracker.getStats();
  }

  @Get('observability/cost/:runId')
  getRunCost(@Param('runId') runId: string) {
    return this.costTracker.getRunCost(runId);
  }

  @Get('observability/quality')
  getQualityTrend() {
    return {
      trend: this.onlineMonitor.getQualityTrend(10),
      alerts: this.onlineMonitor.checkAlerts(),
    };
  }
}
