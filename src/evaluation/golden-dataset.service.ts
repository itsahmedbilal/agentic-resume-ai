import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GOLDEN DATASET SERVICE — curated set of JD ↔ expected output pairs.
 * Used for regression testing the pipeline.
 */

export interface GoldenTestCase {
  id: string;
  name: string;
  jdText: string;
  expectedSkillsCovered: string[];
  expectedMinBullets: number;
  minKeywordCoverage: number;
  maxPages: number;
  notes: string;
}

export interface ComparisonResult {
  testCaseId: string;
  passed: boolean;
  skillsCoveredPct: number;
  keywordCoveragePct: number;
  bulletCount: number;
  pages: number;
  failures: string[];
}

@Injectable()
export class GoldenDatasetService {
  private readonly logger = new Logger(GoldenDatasetService.name);
  private readonly dataPath: string;

  constructor() {
    this.dataPath = path.resolve('data/golden-dataset.json');
  }

  loadDataset(): GoldenTestCase[] {
    try {
      if (!fs.existsSync(this.dataPath)) {
        this.logger.warn('Golden dataset not found — returning empty');
        return [];
      }
      const raw = fs.readFileSync(this.dataPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err: any) {
      this.logger.error(`Failed to load golden dataset: ${err.message}`);
      return [];
    }
  }

  compare(
    testCase: GoldenTestCase,
    actual: {
      keywordCoveragePct: number;
      bulletCount: number;
      pages: number;
      requiredSkills: string[];
    },
  ): ComparisonResult {
    const failures: string[] = [];

    // Check keyword coverage
    if (actual.keywordCoveragePct < testCase.minKeywordCoverage) {
      failures.push(
        `Keyword coverage ${actual.keywordCoveragePct}% < expected ${testCase.minKeywordCoverage}%`,
      );
    }

    // Check bullet count
    if (actual.bulletCount < testCase.expectedMinBullets) {
      failures.push(
        `Bullet count ${actual.bulletCount} < expected min ${testCase.expectedMinBullets}`,
      );
    }

    // Check page count
    if (actual.pages > testCase.maxPages) {
      failures.push(
        `Page count ${actual.pages} > max ${testCase.maxPages}`,
      );
    }

    // Check skill coverage
    const coveredSkills = testCase.expectedSkillsCovered.filter(s =>
      actual.requiredSkills.some(r =>
        r.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(r.toLowerCase()),
      ),
    );
    const skillsCoveredPct = testCase.expectedSkillsCovered.length > 0
      ? (coveredSkills.length / testCase.expectedSkillsCovered.length) * 100
      : 100;

    return {
      testCaseId: testCase.id,
      passed: failures.length === 0,
      skillsCoveredPct,
      keywordCoveragePct: actual.keywordCoveragePct,
      bulletCount: actual.bulletCount,
      pages: actual.pages,
      failures,
    };
  }

  addTestCase(testCase: GoldenTestCase): void {
    const existing = this.loadDataset();
    existing.push(testCase);
    fs.writeFileSync(this.dataPath, JSON.stringify(existing, null, 2));
    this.logger.log(`Added golden test case: ${testCase.id}`);
  }
}
