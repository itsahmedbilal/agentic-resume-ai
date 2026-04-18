import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TraceService } from './trace.service';
import { FeedbackService } from './feedback.service';
import { CostTrackerService } from './cost-tracker.service';

@Module({
  imports: [ConfigModule],
  providers: [TraceService, FeedbackService, CostTrackerService],
  exports: [TraceService, FeedbackService, CostTrackerService],
})
export class ObservabilityModule {}
