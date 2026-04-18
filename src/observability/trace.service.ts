import { Injectable, Logger } from '@nestjs/common';

/**
 * Per-stage execution tracing — tracks timing, metadata, and errors for every pipeline stage.
 */

export interface Trace {
  runId: string;
  startTime: number;
  spans: Span[];
  metadata: Record<string, any>;
}

export interface Span {
  name: string;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  metadata: Record<string, any>;
  error: string | null;
}

export interface TraceResult {
  runId: string;
  totalMs: number;
  stages: Array<{
    name: string;
    durationMs: number;
    metadata: Record<string, any>;
    error: string | null;
  }>;
}

@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name);
  private readonly activeTraces = new Map<string, Trace>();

  startTrace(runId: string): Trace {
    const trace: Trace = {
      runId,
      startTime: Date.now(),
      spans: [],
      metadata: {},
    };
    this.activeTraces.set(runId, trace);
    this.logger.log(`Trace started: ${runId}`);
    return trace;
  }

  startSpan(trace: Trace, stageName: string): Span {
    const span: Span = {
      name: stageName,
      startTime: Date.now(),
      endTime: null,
      durationMs: null,
      metadata: {},
      error: null,
    };
    trace.spans.push(span);
    return span;
  }

  endSpan(span: Span, metadata?: Record<string, any>): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    if (metadata) {
      span.metadata = { ...span.metadata, ...metadata };
    }
  }

  failSpan(span: Span, error: string): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.error = error;
  }

  endTrace(trace: Trace): TraceResult {
    const totalMs = Date.now() - trace.startTime;
    this.activeTraces.delete(trace.runId);

    const result: TraceResult = {
      runId: trace.runId,
      totalMs,
      stages: trace.spans.map(s => ({
        name: s.name,
        durationMs: s.durationMs ?? 0,
        metadata: s.metadata,
        error: s.error,
      })),
    };

    this.logger.log(
      `Trace ended: ${trace.runId} — ${totalMs}ms total, ${trace.spans.length} stages`,
    );

    return result;
  }

  getActiveTrace(runId: string): Trace | undefined {
    return this.activeTraces.get(runId);
  }
}
