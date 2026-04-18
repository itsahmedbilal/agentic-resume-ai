import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

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

@Injectable()
export class ExampleStoreService implements OnModuleInit {
  private readonly logger = new Logger(ExampleStoreService.name);
  private db!: Database.Database;

  private readonly MIN_CONFIDENCE = 0.90;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');

    this.db = new Database(dbPath);
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
    this.logger.log(`ExampleStoreService initialized: ${dbPath}`);
  }

  saveExample(example: RewriteExample): void {
    if (!example.gatesPassed || example.confidenceScore < this.MIN_CONFIDENCE) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO rewrite_examples
        (original_bullet, rewritten_bullet, jd_skills, confidence_score, fidelity_score, keyword_coverage, gates_passed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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

  getCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM rewrite_examples WHERE gates_passed = 1',
    ).get() as any;
    return row?.cnt ?? 0;
  }
}
