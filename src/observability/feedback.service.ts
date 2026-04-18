import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Feedback service — links user feedback to specific run traces.
 */

export interface UserFeedback {
  rating: 1 | 2 | 3 | 4 | 5;
  comments?: string;
  bulletsChanged?: string[];
}

export interface FeedbackRecord {
  id: number;
  runId: string;
  rating: number;
  comments: string;
  bulletsChanged: string;
  createdAt: string;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');

    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id          TEXT    NOT NULL,
        rating          INTEGER NOT NULL,
        comments        TEXT    DEFAULT '',
        bullets_changed TEXT    DEFAULT '[]',
        created_at      TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_run ON user_feedback(run_id);
    `);
    this.logger.log('FeedbackService initialized');
  }

  submitFeedback(runId: string, feedback: UserFeedback): void {
    this.db.prepare(`
      INSERT INTO user_feedback (run_id, rating, comments, bullets_changed)
      VALUES (?, ?, ?, ?)
    `).run(
      runId,
      feedback.rating,
      feedback.comments ?? '',
      JSON.stringify(feedback.bulletsChanged ?? []),
    );
    this.logger.log(`Feedback saved for run ${runId}: rating=${feedback.rating}`);
  }

  getFeedback(runId: string): FeedbackRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM user_feedback WHERE run_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(runId) as any;

    if (!row) return null;
    return {
      id: row.id,
      runId: row.run_id,
      rating: row.rating,
      comments: row.comments,
      bulletsChanged: row.bullets_changed,
      createdAt: row.created_at,
    };
  }

  getAverageRating(): number {
    const row = this.db.prepare(
      'SELECT AVG(rating) as avg FROM user_feedback',
    ).get() as any;
    return row?.avg ?? 0;
  }
}
