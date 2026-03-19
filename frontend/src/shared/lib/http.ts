import type { AuthResponse } from "@/features/auth/types/auth.types";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_NAME = "stima_csrf_token";

let csrfToken: string | null = null;
let refreshInFlight: Promise<void> | null = null;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const tokenEntry = document.cookie
    .split(";")
    .map((cookiePart) => cookiePart.trim())
    .find((cookiePart) => cookiePart.startsWith(`${name}=`));

  if (!tokenEntry) {
    return null;
  }

  return decodeURIComponent(tokenEntry.slice(name.length + 1));
}

export function hydrateCsrfTokenFromCookie(): void {
  if (csrfToken) {
    return;
  }

  const cookieToken = getCookieValue(CSRF_COOKIE_NAME);
  if (cookieToken) {
    setCsrfToken(cookieToken);
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | object | null;
  skipRefresh?: boolean;
}

function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function isJsonBody(body: RequestOptions["body"]): body is object {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return false;
  }

  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return false;
  }

  return true;
}

function buildHeaders(method: string, headers?: HeadersInit, hasJsonBody?: boolean): Headers {
  const nextHeaders = new Headers(headers);

  if (hasJsonBody && !nextHeaders.has("Content-Type")) {
    nextHeaders.set("Content-Type", "application/json");
  }

  if (csrfToken && isMutatingMethod(method)) {
    nextHeaders.set("X-CSRF-Token", csrfToken);
  }

  return nextHeaders;
}

async function parsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("Content-Type");
  if (!contentType || !contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown; detail?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }

    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
  }

  return fallback;
}

async function requestRefresh(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        hydrateCsrfTokenFromCookie();

        const authResponse = await request<AuthResponse>("/api/auth/refresh", {
          method: "POST",
          skipRefresh: true,
        });
        setCsrfToken(authResponse.csrf_token);
      } catch (error) {
        clearCsrfToken();
        throw error;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const bodyIsJson = isJsonBody(options.body);

  if (!csrfToken && isMutatingMethod(method)) {
    hydrateCsrfTokenFromCookie();
  }

  let requestBody: BodyInit | null | undefined;

  if (options.body === undefined) {
    requestBody = undefined;
  } else if (options.body === null) {
    requestBody = null;
  } else if (bodyIsJson) {
    requestBody = JSON.stringify(options.body);
  } else {
    requestBody = options.body as BodyInit;
  }

  const response = await fetch(url, {
    ...options,
    method,
    credentials: "include",
    headers: buildHeaders(method, options.headers, bodyIsJson),
    body: requestBody,
  });

  if (response.status === 401 && !options.skipRefresh && url !== "/api/auth/refresh") {
    await requestRefresh();

    return request<T>(url, {
      ...options,
      skipRefresh: true,
    });
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    const fallbackMessage = response.statusText || "Request failed";
    throw new Error(getErrorMessage(payload, fallbackMessage));
  }

  return payload as T;
}
