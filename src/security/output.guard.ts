import { Injectable, Logger } from '@nestjs/common';
import { OutputValidationResult } from '../models/validation-result.model';
import * as fs from 'fs';

/**
 * OUTPUT GUARD — final checkpoint before returning response to user.
 * Validates PDF exists, is one page, ATS-compliant, and metadata is complete.
 */
@Injectable()
export class OutputGuard {
  private readonly logger = new Logger(OutputGuard.name);

  async validate(response: {
    pdfPath: string;
    pageCount: number;
    metadata: {
      keywordCoveragePct: number;
      avgConfidenceScore: number;
      bulletsFlaggedForReview: number;
      jdRequiredSkills: string[];
      missingKeywords: string[];
      generatedAt: string;
    };
  }): Promise<OutputValidationResult> {
    const issues: string[] = [];

    // Check 1: PDF file exists
    const pdfExists = fs.existsSync(response.pdfPath);
    if (!pdfExists) {
      issues.push(`PDF file not found: ${response.pdfPath}`);
    }

    // Check 2: Page count
    const isOnePage = response.pageCount === 1;
    if (!isOnePage) {
      issues.push(`PDF has ${response.pageCount} pages, expected 1`);
    }

    // Check 3: ATS compliance (text extraction check)
    let atsCompliant = false;
    if (pdfExists) {
      try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(response.pdfPath);
        const data = await pdfParse(buffer);
        atsCompliant = data.text.trim().length >= 500;
        if (!atsCompliant) {
          issues.push(`ATS check failed: only ${data.text.trim().length} extractable chars (need ≥500)`);
        }
      } catch (err: any) {
        issues.push(`ATS check error: ${err.message}`);
      }
    }

    // Check 4: Metadata completeness
    const metadataComplete =
      response.metadata.generatedAt !== '' &&
      response.metadata.jdRequiredSkills.length > 0 &&
      typeof response.metadata.keywordCoveragePct === 'number' &&
      typeof response.metadata.avgConfidenceScore === 'number';

    if (!metadataComplete) {
      issues.push('Response metadata incomplete');
    }

    // Check 5: Quality threshold warnings
    if (response.metadata.keywordCoveragePct < 50) {
      issues.push(`Low keyword coverage: ${response.metadata.keywordCoveragePct}%`);
    }
    if (response.metadata.avgConfidenceScore < 0.5) {
      issues.push(`Low confidence: ${response.metadata.avgConfidenceScore}`);
    }

    const approved = pdfExists && isOnePage && atsCompliant && metadataComplete;

    if (!approved) {
      this.logger.warn(`Output guard: ${issues.length} issue(s) — ${issues.join('; ')}`);
    }

    return {
      pdfExists,
      pdfPageCount: response.pageCount,
      isOnePage,
      atsCompliant,
      metadataComplete,
      approved,
      issues,
    };
  }
}
