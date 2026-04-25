import { isHttpRequestError } from "@/shared/lib/http";

export function isExplicitAuthFailure(error: unknown): boolean {
  return isHttpRequestError(error) && (error.status === 401 || error.status === 403);
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
