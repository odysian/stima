import { isHttpRequestError } from "@/shared/lib/http";

function isAuthErrorMessage(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes("csrf token missing")
    || normalized.includes("missing csrf")
    || normalized.includes("missing access token")
    || normalized.includes("access token missing")
    || normalized.includes("refresh token expired")
    || normalized.includes("invalid refresh token")
    || normalized.includes("invalid access token")
    || normalized.includes("authentication required")
    || normalized.includes("not authenticated")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden")
  );
}

export function isExplicitAuthFailure(error: unknown): boolean {
  if (!isHttpRequestError(error)) {
    return false;
  }

  if (error.status === 401 || error.status === 403) {
    return true;
  }

  if (isAuthErrorMessage(error.message)) {
    return true;
  }

  if (error.payload && typeof error.payload === "object") {
    const payload = error.payload as { detail?: unknown; message?: unknown };
    return isAuthErrorMessage(payload.detail) || isAuthErrorMessage(payload.message);
  }

  return false;
}

export function isOfflineOrNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (isHttpRequestError(error)) {
    return false;
  }

  if (!(error instanceof TypeError)) {
    return false;
  }

  if (error.name === "AbortError") {
    return false;
  }

  return /failed to fetch/i.test(error.message);
}
