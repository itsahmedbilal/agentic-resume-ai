import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { PipelineContext, createEmptyContext } from '../models/pipeline-context.model';
import { flatSkills } from '../models/profile.model';

// Services
import { QueryRewriterService } from './query-rewriter.service';
import { RouterService } from './router.service';
import { SemanticCacheService } from './semantic-cache.service';
import { MemoryService } from './memory.service';

// Agents
import { DecomposerAgent } from '../agents/decomposer.agent';

// Infrastructure
import { GeminiService } from './gemini.service';
import { EmbeddingService } from './embedding.service';
import { ProfileLoaderService } from './profile-loader.service';
import { PdfGeneratorService } from './pdf-generator.service';

// Prompts
import { PromptRegistry } from '../prompts/prompt-registry';
import { BulletMergeInput, SummaryRewriteInput, BulletRewriteInput } from '../prompts/prompt.types';

// Security
import { InputGuard } from '../security/input.guard';
import { ContentGuard } from '../security/content.guard';
import { OutputGuard } from '../security/output.guard';

// Observability
import { TraceService } from '../observability/trace.service';
import { CostTrackerService } from '../observability/cost-tracker.service';

import { runWithConcurrency } from '../utils/concurrency';
import { DocumentGraderAgent } from '@/agents/document-grader.agent';
import { AdaptiveRouterAgent } from '@/agents/adaptive-router.agent';

/**
 * RAG PIPELINE SERVICE — the central orchestrator.
 * Replaces the old PipelineService with a fully instrumented, guarded, agentic flow.
 */
@Injectable()
export class RagPipelineService {
  private readonly logger = new Logger(RagPipelineService.name);
  private readonly outputDir: string;

  constructor(
    private readonly config: ConfigService,
    // Services
    private readonly queryRewriter: QueryRewriterService,
    private readonly router: RouterService,
    private readonly semanticCache: SemanticCacheService,
    private readonly memory: MemoryService,
    // Agents
    private readonly decomposer: DecomposerAgent,
    private readonly grader: DocumentGraderAgent,
    private readonly adaptiveRouter: AdaptiveRouterAgent,
    // Infrastructure
    private readonly gemini: GeminiService,
    private readonly embedding: EmbeddingService,
    private readonly profileLoader: ProfileLoaderService,
    private readonly pdfGenerator: PdfGeneratorService,
    // Prompts
    private readonly prompts: PromptRegistry,
    // Security
    private readonly inputGuard: InputGuard,
    private readonly contentGuard: ContentGuard,
    private readonly outputGuard: OutputGuard,
    // Observability
    private readonly tracer: TraceService,
    private readonly costTracker: CostTrackerService,
  ) {
    this.outputDir = this.config.get<string>('OUTPUT_DIR', 'output/resumes');
  }

  async execute(jdText: string, topN?: number, fidelityThreshold?: number) {
    const runId = uuidv4();
    const profile = this.profileLoader.getProfile();
    const allBullets = this.profileLoader.getBullets();

    const ctx = createEmptyContext(runId, profile, allBullets, jdText);
    const trace = this.tracer.startTrace(runId);
    const pipelineStart = Date.now();
    let llmCallCount = 0;

    try {
      // ── STAGE 1: Input Guard ────────────────────────────────
      const s1 = this.tracer.startSpan(trace, 'input_guard');
      const inputResult = this.inputGuard.validate(jdText);
      if (inputResult.isBlocked) {
        this.tracer.failSpan(s1, 'Input blocked by security guard');
        throw new Error('Input blocked by security guard: potential prompt injection detected');
      }
      ctx.sanitizedJdText = inputResult.sanitizedText;
      this.tracer.endSpan(s1, { threats: inputResult.threats.length });

      // ── STAGE 2: Query Rewriting ────────────────────────────
      const s2 = this.tracer.startSpan(trace, 'query_rewrite');
      ctx.rewrittenQuery = this.queryRewriter.rewrite(ctx.sanitizedJdText);
      this.tracer.endSpan(s2, {
        skills: ctx.rewrittenQuery.expandedSkills.length,
        domain: ctx.rewrittenQuery.jdDomain,
        complexity: ctx.rewrittenQuery.complexity,
      });

      // ── STAGE 3: Routing Strategy ───────────────────────────
      const s3 = this.tracer.startSpan(trace, 'routing');
      const baseStrategy = this.router.route(ctx.rewrittenQuery, profile);
      const domainInsight = this.memory.getDomainInsights(ctx.rewrittenQuery.jdDomain);
      ctx.strategy = this.adaptiveRouter.decide(profile, ctx.rewrittenQuery, domainInsight, baseStrategy);
      if (topN) ctx.strategy.topN = topN;
      this.tracer.endSpan(s3, { strategy: ctx.strategy.type, reason: ctx.strategy.reason });

      // ── STAGE 4: JD Extraction (LLM) ───────────────────────
      const s4 = this.tracer.startSpan(trace, 'jd_extraction');
      const jdPrompt = this.prompts.get('jd-extraction');
      const jdPromptStr = jdPrompt.build({ jdText: ctx.sanitizedJdText });
      const jdCacheKey = this.semanticCache.hash(jdPromptStr);

      let jdRaw = this.semanticCache.get(jdCacheKey);
      if (!jdRaw) {
        const callStart = Date.now();
        jdRaw = await this.gemini.generateResponse(jdPromptStr, jdPrompt.maxTokens);
        llmCallCount++;
        this.costTracker.recordCall({
          runId, provider: 'gemini', model: 'gemini-2.0-flash',
          type: 'generation', inputTokens: jdPromptStr.length / 4,
          outputTokens: jdRaw.length / 4, latencyMs: Date.now() - callStart, cost: 0,
        });
        this.semanticCache.set(jdCacheKey, jdPromptStr.slice(0, 100), jdRaw, 1.0);
      }
      ctx.jdExtraction = jdPrompt.parseOutput(jdRaw);
      this.tracer.endSpan(s4, { skills: ctx.jdExtraction!.requiredSkills.length, cached: !!this.semanticCache.get(jdCacheKey) });

      // ── STAGE 5: JD Decomposition ──────────────────────────
      const s5 = this.tracer.startSpan(trace, 'decomposition');
      ctx.jdDecomposition = this.decomposer.decompose(ctx.jdExtraction!);
      this.tracer.endSpan(s5, {
        core: ctx.jdDecomposition.coreRequirements.length,
        secondary: ctx.jdDecomposition.secondaryRequirements.length,
      });

      // ── STAGE 6: Document Grading ──────────────────────────
      const s6 = this.tracer.startSpan(trace, 'document_grading');
      ctx.gradedBullets = await this.grader.gradeBullets(
        allBullets, ctx.jdExtraction!, ctx.strategy.topN, this.embedding,
      );
      this.tracer.endSpan(s6, { graded: ctx.gradedBullets.length });

      // ── STAGE 7: Bullet Merge + Rewrite ────────────────────
      const s7 = this.tracer.startSpan(trace, 'merge_and_rewrite');

      // Build tech whitelist once
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

      const effectiveFidelity = fidelityThreshold ?? 0.55; // Jaccard threshold (lower than cosine)

      // Group bullets by role
      const bulletsByRole = new Map<string, typeof ctx.gradedBullets>();
      for (const gb of ctx.gradedBullets) {
        const key = `${gb.bullet.companyOrProject}|${gb.bullet.roleTitle}`;
        if (!bulletsByRole.has(key)) bulletsByRole.set(key, []);
        bulletsByRole.get(key)!.push(gb);
      }

      // Merge + rewrite per role
      const mergePrompt = this.prompts.get<BulletMergeInput>('bullet-merge');
      const rewritePrompt = this.prompts.get<BulletRewriteInput>('bullet-rewrite');

      const tasks = [...bulletsByRole.entries()].map(([roleKey, gradedBullets]) => async () => {
        const bulletTexts = gradedBullets.map(gb => gb.bullet.originalText);
        const maxPerRole = ctx.strategy.maxBulletsPerRole;

        let finalBullets: string[];

        if (ctx.strategy.merge && bulletTexts.length > maxPerRole) {
          // Merge bullets
          const mergeInput: BulletMergeInput = {
            bullets: bulletTexts,
            maxOutputBullets: maxPerRole,
            requiredSkills: ctx.jdExtraction!.requiredSkills,
            maxCharsPerBullet: ctx.strategy.maxBulletChars,
          };
          const mergeStr = mergePrompt.build(mergeInput);
          const callStart = Date.now();
          const mergeRaw = await this.gemini.generateResponse(mergeStr, mergePrompt.maxTokens);
          llmCallCount++;
          this.costTracker.recordCall({
            runId, provider: 'gemini', model: 'gemini-2.0-flash',
            type: 'generation', inputTokens: mergeStr.length / 4,
            outputTokens: mergeRaw.length / 4, latencyMs: Date.now() - callStart, cost: 0,
          });
          const mergeResult = mergePrompt.parseOutput(mergeRaw);
          finalBullets = mergeResult.mergedBullets.length > 0 ? mergeResult.mergedBullets : bulletTexts.slice(0, maxPerRole);

          // Validate merge
          const mergeValidation = this.contentGuard.validateMerge(bulletTexts, finalBullets);
          if (!mergeValidation.isValid) {
            this.logger.warn(`Merge validation failed for ${roleKey}: missing tech=${mergeValidation.missingTech.join(',')}`);
          }
        } else {
          finalBullets = bulletTexts.slice(0, maxPerRole);
        }

        // Rewrite each merged/selected bullet
        const rewrittenBullets: string[] = [];
        for (const bullet of finalBullets) {
          const rewriteInput: BulletRewriteInput = {
            originalText: bullet,
            requiredSkills: ctx.jdExtraction!.requiredSkills,
            seniority: ctx.jdExtraction!.seniority,
            domainContext: ctx.jdExtraction!.domainContext,
            strict: false,
            examplesBlock: this.buildExamplesBlock(ctx.jdExtraction!.requiredSkills),
          };
          const rewriteStr = rewritePrompt.build(rewriteInput);

          // Check cache
          const cacheKey = this.semanticCache.hash(rewriteStr);
          let rewriteRaw = this.semanticCache.get(cacheKey);
          if (!rewriteRaw) {
            const callStart = Date.now();
            rewriteRaw = await this.gemini.generateResponse(rewriteStr, rewritePrompt.maxTokens);
            llmCallCount++;
            this.costTracker.recordCall({
              runId, provider: 'gemini', model: 'gemini-2.0-flash',
              type: 'generation', inputTokens: rewriteStr.length / 4,
              outputTokens: rewriteRaw.length / 4, latencyMs: Date.now() - callStart, cost: 0,
            });
          }

          const rewriteResult = rewritePrompt.parseOutput(rewriteRaw);
          const rewritten = rewriteResult.rewrittenText;

          // Validate through content guard
          const validation = this.contentGuard.validateBullet(
            bullet, rewritten, ctx.jdExtraction!, effectiveFidelity,
            allProfileTechTerms, ctx.strategy.maxBulletChars,
          );

          if (validation.gatesPassed) {
            rewrittenBullets.push(rewritten);
            ctx.rewrittenMap.set(bullet, rewritten);
            ctx.confidenceScores.set(bullet, validation.confidenceScore);
            this.semanticCache.set(cacheKey, rewriteStr.slice(0, 100), rewriteRaw, validation.confidenceScore);

            // Save to memory
            this.memory.saveExample({
              originalBullet: bullet,
              rewrittenBullet: rewritten,
              jdSkills: ctx.jdExtraction!.requiredSkills,
              confidenceScore: validation.confidenceScore,
              fidelityScore: validation.fidelityScore,
              keywordCoverage: validation.keywordFound,
              gatesPassed: validation.gatesPassed,
            });
          } else {
            // Fall back to original
            rewrittenBullets.push(bullet);
            ctx.rewrittenMap.set(bullet, bullet);
            ctx.confidenceScores.set(bullet, 0.0);
            ctx.flaggedCount++;
          }

          ctx.gateResults.push({ ...validation, original: bullet });
        }

        ctx.mergedBullets.set(roleKey, rewrittenBullets);
        return { roleKey, rewrittenBullets };
      });

      await runWithConcurrency(tasks, ctx.strategy.concurrency);
      this.tracer.endSpan(s7, {
        totalBullets: ctx.rewrittenMap.size,
        flagged: ctx.flaggedCount,
        llmCalls: llmCallCount,
      });

      // ── STAGE 8: Profile Filtering ─────────────────────────
      const s8 = this.tracer.startSpan(trace, 'profile_filtering');
      const filteredProfile = structuredClone(profile);

      // Replace achievements with merged/rewritten bullets
      for (const exp of filteredProfile.experience) {
        const key = `${exp.company}|${exp.title}`;
        const mergedBullets = ctx.mergedBullets.get(key);
        if (mergedBullets && mergedBullets.length > 0) {
          exp.achievements = mergedBullets;
        } else {
          // Keep top 3 original bullets even if not rewritten
          exp.achievements = exp.achievements.slice(0, ctx.strategy.maxBulletsPerRole);
        }
      }

      // Filter projects — keep top N by grading score
      const projectKeys = new Set(
        ctx.gradedBullets
          .filter(gb => gb.bullet.sourceType === 'project')
          .map(gb => gb.bullet.companyOrProject),
      );
      filteredProfile.projects = filteredProfile.projects
        .filter(p => projectKeys.has(p.name) || filteredProfile.projects.indexOf(p) < ctx.strategy.maxProjects)
        .slice(0, ctx.strategy.maxProjects);

      for (const proj of filteredProfile.projects) {
        const key = `${proj.name}|${proj.name}`;
        const mergedBullets = ctx.mergedBullets.get(key);
        if (mergedBullets && mergedBullets.length > 0) {
          proj.achievements = mergedBullets;
        } else {
          proj.achievements = proj.achievements.slice(0, 2);
        }
      }

      this.tracer.endSpan(s8, {
        roles: filteredProfile.experience.length,
        projects: filteredProfile.projects.length,
      });

      // ── STAGE 9: Summary Rewrite ───────────────────────────
      const s9 = this.tracer.startSpan(trace, 'summary_rewrite');
      const summaryPrompt = this.prompts.get<SummaryRewriteInput>('summary-rewrite');
      const summaryStr = summaryPrompt.build({
        originalSummary: profile.summary,
        seniority: ctx.jdExtraction!.seniority,
        domainContext: ctx.jdExtraction!.domainContext,
        topSkills: ctx.jdExtraction!.requiredSkills,
      });
      const callStart = Date.now();
      const summaryRaw = await this.gemini.generateResponse(summaryStr, summaryPrompt.maxTokens);
      llmCallCount++;
      this.costTracker.recordCall({
        runId, provider: 'gemini', model: 'gemini-2.0-flash',
        type: 'generation', inputTokens: summaryStr.length / 4,
        outputTokens: summaryRaw.length / 4, latencyMs: Date.now() - callStart, cost: 0,
      });
      ctx.tailoredSummary = summaryPrompt.parseOutput(summaryRaw).rewrittenSummary;
      this.tracer.endSpan(s9);

      // ── STAGE 10: PDF Generation ───────────────────────────
      const s10 = this.tracer.startSpan(trace, 'pdf_generation');
      const outputPdf = path.join(this.outputDir, `resume_${runId}.pdf`);
      await this.pdfGenerator.generatePdf(
        filteredProfile, ctx.rewrittenMap, outputPdf,
        ctx.tailoredSummary!, ctx.jdExtraction!.requiredSkills,
      );
      ctx.pdfPath = outputPdf;
      ctx.pageCount = 1; // PDF generator throws on ATS failure, so reaching here means success
      this.tracer.endSpan(s10, { pages: ctx.pageCount });

      // ── STAGE 11: Output Guard ─────────────────────────────
      const s11 = this.tracer.startSpan(trace, 'output_guard');
      let allRewrittenText = [...ctx.rewrittenMap.values()].join(' ');
      allRewrittenText += ' ' + flatSkills(profile).join(' ');
      const [coveragePct, missingKeywords] = this.contentGuard.computeKeywordCoverage(
        allRewrittenText, ctx.jdExtraction!.requiredSkills,
      );
      ctx.keywordCoveragePct = Math.round(coveragePct * 10000) / 100;
      ctx.missingKeywords = missingKeywords;
      ctx.avgConfidence = ctx.confidenceScores.size > 0
        ? [...ctx.confidenceScores.values()].reduce((a, b) => a + b, 0) / ctx.confidenceScores.size
        : 0.0;

      const outputValidation = await this.outputGuard.validate({
        pdfPath: outputPdf,
        pageCount: ctx.pageCount,
        metadata: {
          keywordCoveragePct: ctx.keywordCoveragePct,
          avgConfidenceScore: ctx.avgConfidence,
          bulletsFlaggedForReview: ctx.flaggedCount,
          jdRequiredSkills: ctx.jdExtraction!.requiredSkills,
          missingKeywords,
          generatedAt: ctx.generatedAt,
        },
      });
      this.tracer.endSpan(s11, {
        approved: outputValidation.approved,
        issues: outputValidation.issues.length,
      });

      // ── STAGE 12: Save to Memory ───────────────────────────
      const totalLatency = Date.now() - pipelineStart;
      const gatePassRate = ctx.gateResults.length > 0
        ? ctx.gateResults.filter(g => g.gatesPassed).length / ctx.gateResults.length
        : 0;

      this.memory.saveRunOutcome({
        runId,
        jdDomain: ctx.rewrittenQuery?.jdDomain ?? 'general',
        keywordCoverage: coveragePct,
        avgConfidence: ctx.avgConfidence,
        bulletsFlagged: ctx.flaggedCount,
        totalBullets: ctx.rewrittenMap.size,
        gatePassRate,
        latencyMs: totalLatency,
        llmCalls: llmCallCount,
        strategy: ctx.strategy.type,
      });

      // ── Build Response ─────────────────────────────────────
      const traceResult = this.tracer.endTrace(trace);

      return {
        status: 'success',
        resumeId: runId,
        pdfPath: outputPdf,
        metadata: {
          keywordCoveragePct: ctx.keywordCoveragePct,
          avgConfidenceScore: Math.round(ctx.avgConfidence * 10000) / 10000,
          bulletsFlaggedForReview: ctx.flaggedCount,
          jdRequiredSkills: ctx.jdExtraction!.requiredSkills,
          missingKeywords,
          generatedAt: ctx.generatedAt,
        },
        jdExtraction: ctx.jdExtraction,
        trace: traceResult,
        strategy: ctx.strategy,
        cacheStats: this.semanticCache.getStats(),
        outputValidation,
      };
    } catch (err: any) {
      this.tracer.endTrace(trace);
      throw err;
    }
  }

  private buildExamplesBlock(requiredSkills: string[]): string {
    const examples = this.memory.getRelevantExamples(requiredSkills, 3);
    if (examples.length === 0) return '';

    const lines = examples
      .map((e, i) => `Example ${i + 1}:\n  Original:  ${e.originalBullet}\n  Rewritten: ${e.rewrittenBullet}`)
      .join('\n\n');

    return `STYLE GUIDE — high-quality rewrite examples (STYLE ONLY — do NOT copy technologies):\n${lines}\n\n`;
  }
}
