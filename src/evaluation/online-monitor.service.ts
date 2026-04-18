import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * ONLINE MONITOR — tracks quality metrics for every production run.
 * Detects quality degradation and generates alerts.
 */

export interface QualityTrend {
  period: string;
  avgKeywordCoverage: number;
  avgConfidence: number;
  avgGatePassRate: number;
  totalRuns: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface Alert {
  type: 'quality-drop' | 'high-flag-rate' | 'low-coverage';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: string;
}

@Injectable()
export class OnlineMonitorService implements OnModuleInit {
  private readonly logger = new Logger(OnlineMonitorService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');
    this.db = new Database(dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quality_metrics (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id           TEXT    NOT NULL UNIQUE,
        keyword_coverage REAL    NOT NULL,
        avg_confidence   REAL    NOT NULL,
        gate_pass_rate   REAL    NOT NULL,
        bullets_flagged  INTEGER NOT NULL,
        total_bullets    INTEGER NOT NULL,
        latency_ms       INTEGER NOT NULL,
        llm_calls        INTEGER NOT NULL,
        created_at       TEXT    DEFAULT (datetime('now'))
      );
    `);
    this.logger.log('OnlineMonitorService initialized');
  }

  recordRun(metrics: {
    runId: string;
    keywordCoverage: number;
    avgConfidence: number;
    gatePassRate: number;
    bulletsFlagged: number;
    totalBullets: number;
    latencyMs: number;
    llmCalls: number;
  }): void {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO quality_metrics
          (run_id, keyword_coverage, avg_confidence, gate_pass_rate,
           bullets_flagged, total_bullets, latency_ms, llm_calls)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metrics.runId,
        metrics.keywordCoverage,
        metrics.avgConfidence,
        metrics.gatePassRate,
        metrics.bulletsFlagged,
        metrics.totalBullets,
        metrics.latencyMs,
        metrics.llmCalls,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to record metrics: ${err.message}`);
    }
  }

  getQualityTrend(lastN = 10): QualityTrend {
    const rows = this.db.prepare(
      'SELECT * FROM quality_metrics ORDER BY created_at DESC LIMIT ?',
    ).all(lastN) as any[];

    if (rows.length === 0) {
      return {
        period: `last ${lastN} runs`,
        avgKeywordCoverage: 0,
        avgConfidence: 0,
        avgGatePassRate: 0,
        totalRuns: 0,
        trend: 'stable',
      };
    }

    const avgCov = rows.reduce((s, r) => s + r.keyword_coverage, 0) / rows.length;
    const avgConf = rows.reduce((s, r) => s + r.avg_confidence, 0) / rows.length;
    const avgGate = rows.reduce((s, r) => s + r.gate_pass_rate, 0) / rows.length;

    // Determine trend by comparing first half vs second half
    let trend: QualityTrend['trend'] = 'stable';
    if (rows.length >= 4) {
      const half = Math.floor(rows.length / 2);
      const recentAvg = rows.slice(0, half).reduce((s, r) => s + r.avg_confidence, 0) / half;
      const olderAvg = rows.slice(half).reduce((s, r) => s + r.avg_confidence, 0) / (rows.length - half);

      if (recentAvg > olderAvg + 0.05) trend = 'improving';
      else if (recentAvg < olderAvg - 0.05) trend = 'degrading';
    }

    return {
      period: `last ${rows.length} runs`,
      avgKeywordCoverage: avgCov,
      avgConfidence: avgConf,
      avgGatePassRate: avgGate,
      totalRuns: rows.length,
      trend,
    };
  }

  checkAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const trend = this.getQualityTrend(5);

    if (trend.totalRuns === 0) return alerts;

    if (trend.avgKeywordCoverage < 0.5) {
      alerts.push({
        type: 'low-coverage',
        severity: trend.avgKeywordCoverage < 0.3 ? 'critical' : 'warning',
        message: `Average keyword coverage is ${(trend.avgKeywordCoverage * 100).toFixed(0)}% — below 50% threshold`,
        timestamp: new Date().toISOString(),
      });
    }

    if (trend.avgGatePassRate < 0.6) {
      alerts.push({
        type: 'high-flag-rate',
        severity: trend.avgGatePassRate < 0.4 ? 'critical' : 'warning',
        message: `Gate pass rate is ${(trend.avgGatePassRate * 100).toFixed(0)}% — high bullet fallback rate`,
        timestamp: new Date().toISOString(),
      });
    }

    if (trend.trend === 'degrading') {
      alerts.push({
        type: 'quality-drop',
        severity: 'warning',
        message: 'Quality trend is degrading over recent runs',
        timestamp: new Date().toISOString(),
      });
    }

    return alerts;
  }
}
