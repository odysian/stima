import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import {
  LOCAL_RECOVERY_CHANGED_EVENT,
  type LocalRecoveryChangedDetail,
} from "@/features/quotes/offline/localRecoveryEvents";
import {
  enqueueJob,
  getJob,
  listPendingJobs,
  updateJobStatus,
} from "@/features/quotes/offline/outboxRepository";

describe("outboxRepository", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
  });

  it("creates outbox jobs with queued defaults", async () => {
    const job = await enqueueJob({
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "idem-1",
    });

    expect(job.status).toBe("queued");
    expect(job.attemptCount).toBe(0);
    expect(job.maxAttempts).toBe(5);
    expect(job.nextRetryAt).toBeNull();
  });

  it("reuses an active session job instead of creating duplicates", async () => {
    const firstJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "idem-1",
    });

    const secondJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "idem-2",
    });

    expect(secondJob.jobId).toBe(firstJob.jobId);
    expect(secondJob.idempotencyKey).toBe("idem-1");
  });

  it("lists only pending queued and due retryable jobs", async () => {
    const queuedJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-queued",
      idempotencyKey: "idem-queued",
    });
    const dueRetryableJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-retryable",
      idempotencyKey: "idem-retryable",
    });
    const authPausedJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-auth",
      idempotencyKey: "idem-auth",
    });
    const succeededJob = await enqueueJob({
      userId: "user-1",
      sessionId: "session-done",
      idempotencyKey: "idem-done",
    });

    await updateJobStatus(dueRetryableJob.jobId, {
      status: "failed_retryable",
      lastFailureKind: "timeout",
      nextRetryAt: new Date(Date.now() - 5_000).toISOString(),
      attemptCount: 1,
    });
    await updateJobStatus(authPausedJob.jobId, {
      status: "failed_retryable",
      lastFailureKind: "auth_required",
      nextRetryAt: new Date(Date.now() - 5_000).toISOString(),
      attemptCount: 1,
    });
    await updateJobStatus(succeededJob.jobId, {
      status: "succeeded",
      nextRetryAt: null,
    });

    const pending = await listPendingJobs("user-1");
    const pendingIds = new Set(pending.map((job) => job.jobId));

    expect(pendingIds.has(queuedJob.jobId)).toBe(true);
    expect(pendingIds.has(dueRetryableJob.jobId)).toBe(true);
    expect(pendingIds.has(authPausedJob.jobId)).toBe(false);
    expect(pendingIds.has(succeededJob.jobId)).toBe(false);
  });

  it("persists outbox status updates", async () => {
    const job = await enqueueJob({
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "idem-1",
    });

    await updateJobStatus(job.jobId, {
      status: "failed_retryable",
      attemptCount: 2,
      lastFailureKind: "timeout",
      lastError: "Timed out",
      nextRetryAt: new Date().toISOString(),
    });

    const updatedJob = await getJob(job.jobId);
    expect(updatedJob?.status).toBe("failed_retryable");
    expect(updatedJob?.attemptCount).toBe(2);
    expect(updatedJob?.lastFailureKind).toBe("timeout");
    expect(updatedJob?.lastError).toBe("Timed out");
  });

  it("emits outbox status change events", async () => {
    const events: LocalRecoveryChangedDetail[] = [];
    const eventListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      events.push(event.detail as LocalRecoveryChangedDetail);
    };
    window.addEventListener(LOCAL_RECOVERY_CHANGED_EVENT, eventListener);

    const job = await enqueueJob({
      userId: "user-1",
      sessionId: "session-events",
      idempotencyKey: "idem-events",
    });
    await updateJobStatus(job.jobId, { status: "running" });
    await updateJobStatus(job.jobId, { status: "failed_retryable", attemptCount: 1 });
    await updateJobStatus(job.jobId, { status: "failed_terminal", attemptCount: 2 });

    window.removeEventListener(LOCAL_RECOVERY_CHANGED_EVENT, eventListener);

    expect(events.map((event) => event.reason)).toEqual([
      "outbox_queued",
      "outbox_running",
      "outbox_failed_retryable",
      "outbox_failed_terminal",
    ]);
  });
});
