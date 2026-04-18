import { Injectable, Logger } from '@nestjs/common';
import { GoldenDatasetService, ComparisonResult } from './golden-dataset.service';
import { RagPipelineService } from '../services/rag-pipeline.service';

/**
 * OFFLINE EVAL SERVICE — batch-runs the pipeline against the golden dataset.
 */

export interface EvalReport {
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  avgKeywordCoverage: number;
  avgBulletCount: number;
  results: ComparisonResult[];
  timestamp: string;
}

@Injectable()
export class OfflineEvalService {
  private readonly logger = new Logger(OfflineEvalService.name);

  constructor(
    private readonly goldenDataset: GoldenDatasetService,
    private readonly ragPipeline: RagPipelineService,
  ) {}

  async runEvaluation(): Promise<EvalReport> {
    const dataset = this.goldenDataset.loadDataset();

    if (dataset.length === 0) {
      return {
        totalCases: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        avgKeywordCoverage: 0,
        avgBulletCount: 0,
        results: [],
        timestamp: new Date().toISOString(),
      };
    }

    this.logger.log(`Running offline evaluation: ${dataset.length} test cases`);
    const results: ComparisonResult[] = [];

    for (const testCase of dataset) {
      try {
        this.logger.log(`Evaluating: ${testCase.id} — ${testCase.name}`);
        const output = await this.ragPipeline.execute(testCase.jdText);

        const comparison = this.goldenDataset.compare(testCase, {
          keywordCoveragePct: output.metadata.keywordCoveragePct,
          bulletCount: output.metadata.jdRequiredSkills.length,
          pages: output.outputValidation?.pdfPageCount ?? 1,
          requiredSkills: output.metadata.jdRequiredSkills,
        });

        results.push(comparison);
        this.logger.log(
          `  Result: ${comparison.passed ? '✅ PASS' : '❌ FAIL'} — ` +
          `coverage=${comparison.keywordCoveragePct}%, ` +
          `failures=[${comparison.failures.join('; ')}]`,
        );
      } catch (err: any) {
        this.logger.error(`  Error: ${err.message}`);
        results.push({
          testCaseId: testCase.id,
          passed: false,
          skillsCoveredPct: 0,
          keywordCoveragePct: 0,
          bulletCount: 0,
          pages: 0,
          failures: [`Runtime error: ${err.message}`],
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    const report: EvalReport = {
      totalCases: dataset.length,
      passed,
      failed: dataset.length - passed,
      passRate: dataset.length > 0 ? (passed / dataset.length) * 100 : 0,
      avgKeywordCoverage: results.reduce((s, r) => s + r.keywordCoveragePct, 0) / results.length,
      avgBulletCount: results.reduce((s, r) => s + r.bulletCount, 0) / results.length,
      results,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `Evaluation complete: ${passed}/${dataset.length} passed (${report.passRate.toFixed(1)}%)`,
    );

    return report;
  }
}
