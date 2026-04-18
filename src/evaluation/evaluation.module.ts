import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServicesModule } from '../services/services.module';
import { GoldenDatasetService } from './golden-dataset.service';
import { OfflineEvalService } from './offline-eval.service';
import { OnlineMonitorService } from './online-monitor.service';

@Module({
  imports: [ConfigModule, forwardRef(() => ServicesModule)],
  providers: [GoldenDatasetService, OfflineEvalService, OnlineMonitorService],
  exports: [GoldenDatasetService, OfflineEvalService, OnlineMonitorService],
})
export class EvaluationModule {}
