import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JdService } from './jd.service';
import { MatchingService } from './matching.service';
import { RewriteService } from './rewrite.service';
import { ValidationService } from './validation.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { ProfileLoaderService } from './profile-loader.service';
import { ExampleStoreService } from './example-store.service';
import { flatSkills } from '../models/profile.model';
import { runWithConcurrency } from '../utils/concurrency';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  private readonly topNBullets: number;
  private readonly fidelityThreshold: number;
  private readonly confidenceFlagThreshold: number;
  private readonly maxBulletsPerRole: number;
  private readonly maxProjects: number;
  private readonly outputDir: string;
  private readonly rewriteConcurrency: number;

  constructor(
    private readonly config: ConfigService,
    private readonly jdService: JdService,
    private readonly matchingService: MatchingService,
    private readonly rewriteService: RewriteService,
    private readonly validationService: ValidationService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly profileLoaderService: ProfileLoaderService,
    private readonly exampleStore: ExampleStoreService,
  ) {
    this.topNBullets = this.config.get<number>('TOP_N_BULLETS', 15);
    this.fidelityThreshold = this.config.get<number>('FIDELITY_THRESHOLD', 0.9);
    this.confidenceFlagThreshold = this.config.get<number>('CONFIDENCE_FLAG_THRESHOLD', 0.75);
    this.maxBulletsPerRole = this.config.get<number>('MAX_BULLETS_PER_ROLE', 5);
    this.maxProjects = this.config.get<number>('MAX_PROJECTS', 3);
    this.outputDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
    this.rewriteConcurrency = this.config.get<number>('REWRITE_CONCURRENCY', 3);
  }

  async execute(jdText: string, topN?: number, fidelityThreshold?: number) {
    const effectiveTopN = topN ?? this.topNBullets;
    const effectiveFidelity = fidelityThreshold ?? this.fidelityThreshold;
    const runId = uuidv4();
    const generatedAt = new Date().toISOString();

    // Stage 1 — Profile Loading (cached in service)
    const profile = this.profileLoaderService.getProfile();
    const allBullets = this.profileLoaderService.getBullets();

    // Stage 2 — JD Extraction
    const jd = await this.jdService.extractContext(jdText);
    this.logger.log(`JD extracted: ${jd.requiredSkills.length} required skills`);

    // Stage 3 — Semantic Matching
    const topBulletsTuples = await this.matchingService.getTopBullets(
      jdText, allBullets, effectiveTopN, jd.requiredSkills,
    );
    this.logger.log(`Matched ${topBulletsTuples.length} top bullets`);

    // Build allProfileTechTerms ONCE
    const allProfileTechTerms = new Set<string>([
      ...flatSkills(profile),
      ...profile.experience.flatMap(e => e.techStack),
      ...profile.projects.flatMap(p => p.techStack),
      ...[
        ...flatSkills(profile),
        ...profile.experience.flatMap(e => e.techStack),
        ...profile.projects.flatMap(p => p.techStack),
      ].flatMap(term => term.split(/[\s.\-_/]+/).filter(t => t.length > 1)),
    ]);

    this.logger.log(`Pipeline start — example store has ${this.exampleStore.getCount()} examples`);

    // Stage 4 — Rewrite + Validate (Parallel)
    const rewrittenMap = new Map<string, string>();
    const confidenceScores = new Map<string, number>();
    const gateResults: any[] = [];
    let flaggedCount = 0;

    const tasks = topBulletsTuples.map(([bullet]) => async () => {
      const [rewritten, validation] = await this.rewriteService.rewriteWithRetry(
        jd, bullet, this.validationService, effectiveFidelity, allProfileTechTerms,
      );

      this.exampleStore.saveExample({
        originalBullet: bullet.originalText,
        rewrittenBullet: rewritten,
        jdSkills: jd.requiredSkills,
        confidenceScore: validation.confidenceScore,
        fidelityScore: validation.fidelityScore,
        keywordCoverage: validation.keywordFound,
        gatesPassed: validation.gatesPassed,
      });

      return { bullet, rewritten, validation };
    });

    const settled = await runWithConcurrency(tasks, this.rewriteConcurrency);

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { bullet, rewritten, validation } = result.value;
        const conf = validation.confidenceScore ?? 0.0;
        rewrittenMap.set(bullet.originalText, rewritten);
        confidenceScores.set(bullet.originalText, conf);
        gateResults.push({ ...validation, original: bullet.originalText });
        if (conf < this.confidenceFlagThreshold) flaggedCount++;
      } else {
        this.logger.error(`Bullet rewrite failed: ${result.reason}`);
        flaggedCount++;
      }
    }

    // Stage 5 — Profile Filtering
    const filteredProfile = structuredClone(profile);

    for (const exp of filteredProfile.experience) {
      exp.achievements = exp.achievements
        .filter(a => rewrittenMap.has(a))
        .slice(0, this.maxBulletsPerRole);
    }
    filteredProfile.experience = filteredProfile.experience.filter(e => e.achievements.length > 0);

    const bulletScoreMap = new Map(topBulletsTuples.map(([b, s]) => [b.originalText, s]));
    const projectScores: [number, number][] = filteredProfile.projects.map((proj, i) => {
      proj.achievements = proj.achievements.filter(a => rewrittenMap.has(a));
      const avg = proj.achievements.length > 0
        ? proj.achievements.reduce((sum, a) => sum + (bulletScoreMap.get(a) ?? 0), 0) / proj.achievements.length
        : 0;
      return [i, avg];
    });
    projectScores.sort((a, b) => b[1] - a[1]);
    const topProjectIndices = new Set(projectScores.slice(0, this.maxProjects).map(([idx]) => idx));
    filteredProfile.projects = filteredProfile.projects.filter(
      (_, i) => topProjectIndices.has(i) && filteredProfile.projects[i].achievements.length > 0,
    );

    // Stage 6 — Summary Rewrite
    const tailoredSummary = await this.rewriteService.generateSummary(profile.summary, jd);

    // Stage 7 — PDF Generation
    const outputPdf = path.join(this.outputDir, `resume_${runId}.pdf`);
    await this.pdfGeneratorService.generatePdf(
      filteredProfile, rewrittenMap, outputPdf, tailoredSummary, jd.requiredSkills,
    );

    // Stage 8 — Build Response
    let allRewrittenText = [...rewrittenMap.values()].join(' ');
    allRewrittenText += ' ' + flatSkills(profile).join(' ');
    const [coveragePct, missingKeywords] = this.validationService.computeResumeKeywordCoverage(
      allRewrittenText, jd.requiredSkills,
    );

    const avgConfidence = confidenceScores.size > 0
      ? [...confidenceScores.values()].reduce((a, b) => a + b, 0) / confidenceScores.size
      : 0.0;

    return {
      status: 'success',
      resumeId: runId,
      pdfPath: outputPdf,
      metadata: {
        keywordCoveragePct: Math.round(coveragePct * 10000) / 100,
        avgConfidenceScore: Math.round(avgConfidence * 10000) / 10000,
        bulletsFlaggedForReview: flaggedCount,
        jdRequiredSkills: jd.requiredSkills,
        missingKeywords,
        generatedAt,
      },
      jdExtraction: jd,
    };
  }
}
