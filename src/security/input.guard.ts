import { Injectable, Logger } from '@nestjs/common';

/**
 * INPUT GUARD — sanitizes and validates all input before it reaches the pipeline.
 * Checks for prompt injection, excessive length, and malicious patterns.
 */

export interface InputValidationResult {
  sanitizedText: string;
  isBlocked: boolean;
  threats: Threat[];
}

export interface Threat {
  type: 'prompt-injection' | 'excessive-length' | 'malicious-pattern' | 'encoding-attack';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

@Injectable()
export class InputGuard {
  private readonly logger = new Logger(InputGuard.name);

  private static readonly MAX_JD_LENGTH = 10000;

  private static readonly INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: Threat['severity'] }> = [
    { pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/i, severity: 'high' },
    { pattern: /you\s+are\s+now\s+/i, severity: 'high' },
    { pattern: /system\s*:\s*/i, severity: 'medium' },
    { pattern: /\bDAN\b/, severity: 'high' },
    { pattern: /do\s+not\s+follow\s+(any|your)\s+(previous|original)/i, severity: 'high' },
    { pattern: /pretend\s+(you\s+are|to\s+be)/i, severity: 'medium' },
    { pattern: /disregard\s+(all|any|previous)/i, severity: 'high' },
    { pattern: /jailbreak/i, severity: 'high' },
    { pattern: /\[\s*INST\s*\]/i, severity: 'medium' },
    { pattern: /<\s*\|?\s*(im_start|im_end|system|user|assistant)\s*\|?\s*>/i, severity: 'high' },
  ];

  validate(jdText: string): InputValidationResult {
    const threats: Threat[] = [];

    // Check 1: Excessive length
    if (jdText.length > InputGuard.MAX_JD_LENGTH) {
      threats.push({
        type: 'excessive-length',
        severity: 'medium',
        detail: `JD text is ${jdText.length} chars, max is ${InputGuard.MAX_JD_LENGTH}`,
      });
    }

    // Check 2: Prompt injection patterns
    for (const { pattern, severity } of InputGuard.INJECTION_PATTERNS) {
      if (pattern.test(jdText)) {
        threats.push({
          type: 'prompt-injection',
          severity,
          detail: `Detected injection pattern: ${pattern.source}`,
        });
      }
    }

    // Check 3: Encoding attacks (null bytes, unicode trickery)
    if (/\x00/.test(jdText)) {
      threats.push({
        type: 'encoding-attack',
        severity: 'high',
        detail: 'Null byte detected in input',
      });
    }

    // Sanitize
    let sanitized = jdText;
    sanitized = sanitized.replace(/\x00/g, '');                     // Remove null bytes
    sanitized = sanitized.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Remove control chars
    sanitized = sanitized.replace(/\s{3,}/g, '  ');                 // Collapse excessive whitespace
    sanitized = sanitized.slice(0, InputGuard.MAX_JD_LENGTH);       // Truncate
    sanitized = sanitized.trim();

    const isBlocked = threats.some(t => t.severity === 'high');

    if (threats.length > 0) {
      this.logger.warn(`Input guard: ${threats.length} threat(s) detected, blocked=${isBlocked}`);
    }

    return { sanitizedText: sanitized, isBlocked, threats };
  }
}
