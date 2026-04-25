import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCaptureSession,
  getCaptureSession,
  listSyncEvents,
  updateCaptureField,
} from "@/features/quotes/offline/captureRepository";
import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import { registerOnlineTrigger, runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import {
  enqueueJob,
  getJob,
  getJobForSession,
  updateJobStatus,
} from "@/features/quotes/offline/outboxRepository";
import { quoteService } from "@/features/quotes/services/quoteService";
import { HttpRequestError } from "@/shared/lib/http";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    extract: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);

describe("outboxEngine", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
    mockedQuoteService.extract.mockReset();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
    vi.restoreAllMocks();
  });

  it("marks queued jobs as succeeded and syncs capture sessions", async () => {
    const session = await createCaptureSession({
      userId: "user-1",
      notes: "Install sod",
      customerId: "customer-1",
    });

    const queuedJob = await enqueueJob({
      userId: "user-1",
      sessionId: session.sessionId,
      idempotencyKey: "idem-1",
    });

    mockedQuoteService.extract.mockResolvedValueOnce({
      type: "sync",
      quoteId: "quote-1",
      result: {
        transcript: "Install sod",
        line_items: [],
        pricing_hints: {
          explicit_total: null,
          deposit_amount: null,
          tax_rate: null,
          discount_type: null,
          discount_value: null,
        },
        customer_notes_suggestion: null,
        extraction_tier: "primary",
        extraction_degraded_reason_code: null,
      },
    });

    await runOutboxPass("user-1");

    const updatedJob = await getJob(queuedJob.jobId);
    const updatedSession = await getCaptureSession(session.sessionId);
    const syncEvents = await listSyncEvents(session.sessionId);

    expect(updatedJob?.status).toBe("succeeded");
    expect(updatedJob?.serverQuoteId).toBe("quote-1");
    expect(updatedSession?.status).toBe("synced");
    expect(updatedSession?.serverQuoteId).toBe("quote-1");
    expect(syncEvents.some((event) => event.message.includes("synced"))).toBe(true);
  });

  it("marks retryable failures with backoff and incremented attempts", async () => {
    const session = await createCaptureSession({
      userId: "user-1",
      notes: "Install sod",
      customerId: "customer-1",
    });

    const queuedJob = await enqueueJob({
      userId: "user-1",
      sessionId: session.sessionId,
      idempotencyKey: "idem-1",
    });

    mockedQuoteService.extract.mockRejectedValueOnce(new Error("Request timed out"));

    await runOutboxPass("user-1");

    const updatedJob = await getJob(queuedJob.jobId);
    const updatedSession = await getCaptureSession(session.sessionId);

    expect(updatedJob?.status).toBe("failed_retryable");
    expect(updatedJob?.attemptCount).toBe(1);
    expect(updatedJob?.lastFailureKind).toBe("timeout");
    expect(updatedJob?.nextRetryAt).not.toBeNull();
    expect(updatedSession?.status).toBe("local_only");
  });

  it("escalates to terminal failure after max attempts", async () => {
    const session = await createCaptureSession({
      userId: "user-1",
      notes: "Install sod",
      customerId: "customer-1",
    });

    const queuedJob = await enqueueJob({
      userId: "user-1",
      sessionId: session.sessionId,
      idempotencyKey: "idem-1",
      maxAttempts: 2,
    });
    await updateJobStatus(queuedJob.jobId, {
      status: "failed_retryable",
      attemptCount: 1,
      nextRetryAt: new Date(Date.now() - 1_000).toISOString(),
      lastFailureKind: "timeout",
    });
    await updateCaptureField(session.sessionId, { outboxJobId: queuedJob.jobId });

    mockedQuoteService.extract.mockRejectedValueOnce(
      new HttpRequestError("Validation failed", 422, { detail: "Validation failed" }),
    );

    await runOutboxPass("user-1");

    const updatedJob = await getJob(queuedJob.jobId);
    const updatedSession = await getCaptureSession(session.sessionId);

    expect(updatedJob?.status).toBe("failed_terminal");
    expect(updatedSession?.status).toBe("extract_failed");
    expect(updatedSession?.lastFailureKind).toBe("validation_failed");
  });

  it("registers and cleans up online event handlers", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const cleanup = registerOnlineTrigger("user-1");

    const addCall = addEventListenerSpy.mock.calls.find((call) => call[0] === "online");
    expect(addCall).toBeDefined();

    cleanup();

    const removeCall = removeEventListenerSpy.mock.calls.find((call) => call[0] === "online");
    expect(removeCall).toBeDefined();
    expect(removeCall?.[1]).toBe(addCall?.[1]);
  });

  it("skips auth-required jobs until forceAfterAuth run", async () => {
    const session = await createCaptureSession({
      userId: "user-1",
      notes: "Install sod",
      customerId: "customer-1",
    });

    const queuedJob = await enqueueJob({
      userId: "user-1",
      sessionId: session.sessionId,
      idempotencyKey: "idem-1",
    });

    mockedQuoteService.extract.mockRejectedValueOnce(
      new HttpRequestError("Unauthorized", 401, { detail: "Unauthorized" }),
    );

    await runOutboxPass("user-1");
    const pausedJob = await getJob(queuedJob.jobId);
    expect(pausedJob?.status).toBe("failed_retryable");
    expect(pausedJob?.lastFailureKind).toBe("auth_required");

    mockedQuoteService.extract.mockResolvedValueOnce({
      type: "sync",
      quoteId: "quote-after-auth",
      result: {
        transcript: "Install sod",
        line_items: [],
        pricing_hints: {
          explicit_total: null,
          deposit_amount: null,
          tax_rate: null,
          discount_type: null,
          discount_value: null,
        },
        customer_notes_suggestion: null,
        extraction_tier: "primary",
        extraction_degraded_reason_code: null,
      },
    });

    const resumedJob = await getJobForSession(session.sessionId);
    if (!resumedJob) {
      throw new Error("Expected resumed job");
    }
    await updateJobStatus(resumedJob.jobId, {
      status: "queued",
      nextRetryAt: null,
    });

    await runOutboxPass("user-1", { forceAfterAuth: true });

    const completedJob = await getJob(queuedJob.jobId);
    expect(completedJob?.status).toBe("succeeded");
  });
});
