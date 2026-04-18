import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * MEMORY SERVICE — cross-run memory and learning.
 * Absorbs ExampleStoreService + adds episodic domain memory.
 */

export interface RewriteExample {
  id?: number;
  originalBullet: string;
  rewrittenBullet: string;
  jdSkills: string[];
  confidenceScore: number;
  fidelityScore: number;
  keywordCoverage: boolean;
  gatesPassed: boolean;
  createdAt?: string;
}

export interface RunMetrics {
  runId: string;
  jdDomain: string;
  keywordCoverage: number;
  avgConfidence: number;
  bulletsFlagged: number;
  totalBullets: number;
  gatePassRate: number;
  latencyMs: number;
  llmCalls: number;
  strategy: string;
}

export interface DomainInsight {
  domain: string;
  totalRuns: number;
  avgKeywordCoverage: number;
  avgConfidence: number;
  bestStrategy: string;
}

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);
  private db!: Database.Database;
  private readonly MIN_CONFIDENCE = 0.90;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');

    this.db = new Database(dbPath);

    // Rewrite examples table (backward-compatible with ExampleStoreService)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rewrite_examples (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        original_bullet TEXT    NOT NULL,
        rewritten_bullet TEXT   NOT NULL,
        jd_skills       TEXT    NOT NULL,
        confidence_score REAL   NOT NULL,
        fidelity_score  REAL    NOT NULL,
        keyword_coverage INTEGER NOT NULL,
        gates_passed    INTEGER NOT NULL,
        created_at      TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_confidence ON rewrite_examples(confidence_score DESC);
      CREATE INDEX IF NOT EXISTS idx_gates ON rewrite_examples(gates_passed);
    `);

    // Run history table (episodic memory)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_history (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id           TEXT    NOT NULL UNIQUE,
        jd_domain        TEXT    NOT NULL,
        keyword_coverage REAL    NOT NULL,
        avg_confidence   REAL    NOT NULL,
        bullets_flagged  INTEGER NOT NULL,
        total_bullets    INTEGER NOT NULL,
        gate_pass_rate   REAL    NOT NULL,
        latency_ms       INTEGER NOT NULL,
        llm_calls        INTEGER NOT NULL,
        strategy         TEXT    NOT NULL,
        created_at       TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_run_domain ON run_history(jd_domain);
    `);

    this.logger.log('MemoryService initialized');
  }

  // ── Example Store (backward-compatible) ──────────────────────

  saveExample(example: RewriteExample): void {
    if (!example.gatesPassed || example.confidenceScore < this.MIN_CONFIDENCE) {
      return;
    }

    this.db.prepare(`
      INSERT INTO rewrite_examples
        (original_bullet, rewritten_bullet, jd_skills, confidence_score, fidelity_score, keyword_coverage, gates_passed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      example.originalBullet,
      example.rewrittenBullet,
      JSON.stringify(example.jdSkills),
      example.confidenceScore,
      example.fidelityScore,
      example.keywordCoverage ? 1 : 0,
      example.gatesPassed ? 1 : 0,
    );
  }

  getRelevantExamples(jdRequiredSkills: string[], limit = 3): RewriteExample[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM rewrite_examples
        WHERE gates_passed = 1 AND confidence_score >= ?
        ORDER BY confidence_score DESC
        LIMIT 50
      `).all(this.MIN_CONFIDENCE) as any[];

      const jdSkillsLower = jdRequiredSkills.map(s => s.toLowerCase());

      return rows
        .map(row => {
          const savedSkills: string[] = JSON.parse(row.jd_skills);
          const overlap = savedSkills.filter(s =>
            jdSkillsLower.includes(s.toLowerCase()),
          ).length;
          return { row, overlap };
        })
        .filter(({ overlap }) => overlap > 0)
        .sort((a, b) => {
          if (b.overlap !== a.overlap) return b.overlap - a.overlap;
          return b.row.confidence_score - a.row.confidence_score;
        })
        .slice(0, limit)
        .map(({ row }) => ({
          id: row.id,
          originalBullet: row.original_bullet,
          rewrittenBullet: row.rewritten_bullet,
          jdSkills: JSON.parse(row.jd_skills),
          confidenceScore: row.confidence_score,
          fidelityScore: row.fidelity_score,
          keywordCoverage: row.keyword_coverage === 1,
          gatesPassed: row.gates_passed === 1,
          createdAt: row.created_at,
        }));
    } catch (err: any) {
      this.logger.warn(`getRelevantExamples failed: ${err.message}`);
      return [];
    }
  }

  getExampleCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM rewrite_examples WHERE gates_passed = 1',
    ).get() as any;
    return row?.cnt ?? 0;
  }

  // ── Episodic Memory (run history) ──────────────────────────

  saveRunOutcome(metrics: RunMetrics): void {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO run_history
          (run_id, jd_domain, keyword_coverage, avg_confidence, bullets_flagged,
           total_bullets, gate_pass_rate, latency_ms, llm_calls, strategy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metrics.runId,
        metrics.jdDomain,
        metrics.keywordCoverage,
        metrics.avgConfidence,
        metrics.bulletsFlagged,
        metrics.totalBullets,
        metrics.gatePassRate,
        metrics.latencyMs,
        metrics.llmCalls,
        metrics.strategy,
      );
    } catch (err: any) {
      this.logger.warn(`saveRunOutcome failed: ${err.message}`);
    }
  }

  getDomainInsights(domain: string): DomainInsight | null {
    try {
      const rows = this.db.prepare(
        'SELECT * FROM run_history WHERE jd_domain = ? ORDER BY created_at DESC LIMIT 10',
      ).all(domain) as any[];

      if (rows.length === 0) return null;

      const avgKw = rows.reduce((s, r) => s + r.keyword_coverage, 0) / rows.length;
      const avgConf = rows.reduce((s, r) => s + r.avg_confidence, 0) / rows.length;

      // Find best strategy by avg confidence
      const strategyScores = new Map<string, number[]>();
      for (const r of rows) {
        if (!strategyScores.has(r.strategy)) strategyScores.set(r.strategy, []);
        strategyScores.get(r.strategy)!.push(r.avg_confidence);
      }
      let bestStrategy = 'standard';
      let bestScore = 0;
      for (const [strat, scores] of strategyScores) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > bestScore) {
          bestScore = avg;
          bestStrategy = strat;
        }
      }

      return {
        domain,
        totalRuns: rows.length,
        avgKeywordCoverage: avgKw,
        avgConfidence: avgConf,
        bestStrategy,
      };
    } catch {
      return null;
    }
  }

  getMemoryStats(): {
    totalExamples: number;
    totalRuns: number;
    domains: string[];
  } {
    const examples = this.getExampleCount();
    const runsRow = this.db.prepare('SELECT COUNT(*) as cnt FROM run_history').get() as any;
    const domainsRows = this.db.prepare(
      'SELECT DISTINCT jd_domain FROM run_history',
    ).all() as any[];

    return {
      totalExamples: examples,
      totalRuns: runsRow?.cnt ?? 0,
      domains: domainsRows.map(r => r.jd_domain),
    };
  }
}
