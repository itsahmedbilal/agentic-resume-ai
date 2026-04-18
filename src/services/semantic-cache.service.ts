import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SEMANTIC CACHE — caches LLM responses keyed by prompt hash.
 * On similar prompts, returns cached response instead of calling LLM.
 * Stored in SQLite — zero new dependencies.
 */

export interface CacheEntry {
  promptHash: string;
  promptPreview: string;
  response: string;
  confidence: number;
  hitCount: number;
  createdAt: string;
}

@Injectable()
export class SemanticCacheService implements OnModuleInit {
  private readonly logger = new Logger(SemanticCacheService.name);
  private db!: Database.Database;
  private hits = 0;
  private misses = 0;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'examples.db');

    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_cache (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_hash     TEXT    UNIQUE NOT NULL,
        prompt_preview  TEXT    NOT NULL,
        response        TEXT    NOT NULL,
        confidence      REAL    DEFAULT 0,
        hit_count       INTEGER DEFAULT 0,
        created_at      TEXT    DEFAULT (datetime('now')),
        last_hit_at     TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cache_hash ON semantic_cache(prompt_hash);
    `);
    this.logger.log('SemanticCacheService initialized');
  }

  /**
   * Look up a cached response by prompt hash.
   * Returns the response string if found, null otherwise.
   */
  get(promptHash: string): string | null {
    const row = this.db.prepare(
      'SELECT response FROM semantic_cache WHERE prompt_hash = ?',
    ).get(promptHash) as any;

    if (row) {
      this.hits++;
      this.db.prepare(
        "UPDATE semantic_cache SET hit_count = hit_count + 1, last_hit_at = datetime('now') WHERE prompt_hash = ?",
      ).run(promptHash);
      return row.response;
    }

    this.misses++;
    return null;
  }

  /**
   * Store a new response in the cache.
   */
  set(promptHash: string, promptPreview: string, response: string, confidence: number): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO semantic_cache (prompt_hash, prompt_preview, response, confidence)
      VALUES (?, ?, ?, ?)
    `).run(promptHash, promptPreview.slice(0, 200), response, confidence);
  }

  /**
   * Generate a stable hash for a prompt string.
   */
  hash(prompt: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(prompt, 'utf-8').digest('hex');
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; ratio: number; totalEntries: number } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM semantic_cache',
    ).get() as any;

    const totalRequests = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      ratio: totalRequests > 0 ? this.hits / totalRequests : 0,
      totalEntries: total?.cnt ?? 0,
    };
  }
}
