import type { SubmitFailureKind } from "@/features/quotes/offline/captureTypes";
import { isHttpRequestError } from "@/shared/lib/http";

function isOfflineEnvironment(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  const normalizedMessage = error.message.toLowerCase();
  return normalizedMessage.includes("timeout") || normalizedMessage.includes("timed out");
}

function readPayloadDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const detail = (payload as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : "";
}

export function classifySubmitFailure(error: unknown): SubmitFailureKind {
  if (isOfflineEnvironment()) {
    return "offline";
  }

  if (isTimeoutLikeError(error)) {
    return "timeout";
  }

  if (!isHttpRequestError(error)) {
    return "server_retryable";
  }

  if (error.status === 401) {
    return "auth_required";
  }
  if (error.status === 403) {
    return "csrf_failed";
  }
  if (error.status === 422) {
    return "validation_failed";
  }
  if (error.status === 409) {
    return readPayloadDetail(error.payload).includes("already in progress")
      ? "server_retryable"
      : "csrf_failed";
  }
  if (error.status >= 500) {
    return "server_retryable";
  }

  return "server_terminal";
}
