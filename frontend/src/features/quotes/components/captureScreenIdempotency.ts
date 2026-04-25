import { getCaptureSession, updateCaptureField } from "@/features/quotes/offline/captureRepository";
import { buildIdempotencyKey } from "@/shared/lib/idempotency";
import { HttpRequestError } from "@/shared/lib/http";

interface ResolveIdempotencyKeyParams {
  localSessionId: string | null;
  ensureLocalCaptureSession: () => Promise<string | null>;
  extractionIdempotencyKeyRef: { current: string | null };
}

export async function resolveExtractionRequestIdempotencyKey({
  localSessionId,
  ensureLocalCaptureSession,
  extractionIdempotencyKeyRef,
}: ResolveIdempotencyKeyParams): Promise<{ idempotencyKey: string; sessionId: string | null }> {
  const sessionId = localSessionId ?? await ensureLocalCaptureSession();
  if (!extractionIdempotencyKeyRef.current && sessionId) {
    const session = await getCaptureSession(sessionId);
    const storedIdempotencyKey = session?.idempotencyKey?.trim() ?? "";
    if (storedIdempotencyKey.length > 0) {
      extractionIdempotencyKeyRef.current = storedIdempotencyKey;
    }
  }

  if (!extractionIdempotencyKeyRef.current) {
    extractionIdempotencyKeyRef.current = buildIdempotencyKey();
  }

  if (sessionId) {
    await updateCaptureField(sessionId, {
      idempotencyKey: extractionIdempotencyKeyRef.current,
    });
  }

  return {
    idempotencyKey: extractionIdempotencyKeyRef.current,
    sessionId,
  };
}

export async function clearExtractionRequestIdempotencyKey(
  sessionId: string | null,
  extractionIdempotencyKeyRef: { current: string | null },
): Promise<void> {
  extractionIdempotencyKeyRef.current = null;
  if (!sessionId) {
    return;
  }
  await updateCaptureField(sessionId, { idempotencyKey: null });
}

export function isInFlightIdempotencyConflict(error: unknown): boolean {
  return error instanceof HttpRequestError
    && error.status === 409
    && error.message.includes("already in progress for this key");
}
