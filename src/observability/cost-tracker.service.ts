import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Cost tracker — tracks token usage and API cost per query.
 */

export interface ApiCallRecord {
  runId: string;
  provider: string;
  model: string;
  type: 'generation' | 'embedding';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
}

export interface RunCost {
  runId: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  estimatedCost: number;
}

export interface CostStats {
  totalRuns: number;
  totalCalls: number;
  totalTokens: number;
  avgCallsPerRun: number;
  avgTokensPerRun: number;
  avgLatencyPerRun: number;
}

@Injectable()
export class CostTrackerService {
  private readonly logger = new Logger(CostTrackerService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');

    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_calls (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id          TEXT    NOT NULL,
        provider        TEXT    NOT NULL,
        model           TEXT    NOT NULL,
        call_type       TEXT    NOT NULL,
        input_tokens    INTEGER DEFAULT 0,
        output_tokens   INTEGER DEFAULT 0,
        latency_ms      INTEGER DEFAULT 0,
        cost            REAL    DEFAULT 0,
        created_at      TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cost_run ON api_calls(run_id);
    `);
    this.logger.log('CostTrackerService initialized');
  }

  recordCall(record: ApiCallRecord): void {
    this.db.prepare(`
      INSERT INTO api_calls (run_id, provider, model, call_type, input_tokens, output_tokens, latency_ms, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.runId,
      record.provider,
      record.model,
      record.type,
      record.inputTokens,
      record.outputTokens,
      record.latencyMs,
      record.cost,
    );
  }

  getRunCost(runId: string): RunCost {
    const rows = this.db.prepare(
      'SELECT * FROM api_calls WHERE run_id = ?',
    ).all(runId) as any[];

    return {
      runId,
      totalCalls: rows.length,
      totalInputTokens: rows.reduce((s, r) => s + r.input_tokens, 0),
      totalOutputTokens: rows.reduce((s, r) => s + r.output_tokens, 0),
      totalLatencyMs: rows.reduce((s, r) => s + r.latency_ms, 0),
      estimatedCost: rows.reduce((s, r) => s + r.cost, 0),
    };
  }

  getStats(): CostStats {
    const total = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM api_calls',
    ).get() as any;

    const runs = this.db.prepare(
      'SELECT COUNT(DISTINCT run_id) as cnt FROM api_calls',
    ).get() as any;

    const tokens = this.db.prepare(
      'SELECT SUM(input_tokens + output_tokens) as total FROM api_calls',
    ).get() as any;

    const latency = this.db.prepare(
      'SELECT SUM(latency_ms) as total FROM api_calls',
    ).get() as any;

    const totalRuns = runs?.cnt ?? 0;
    return {
      totalRuns,
      totalCalls: total?.cnt ?? 0,
      totalTokens: tokens?.total ?? 0,
      avgCallsPerRun: totalRuns > 0 ? (total?.cnt ?? 0) / totalRuns : 0,
      avgTokensPerRun: totalRuns > 0 ? (tokens?.total ?? 0) / totalRuns : 0,
      avgLatencyPerRun: totalRuns > 0 ? (latency?.total ?? 0) / totalRuns : 0,
    };
  }
}
