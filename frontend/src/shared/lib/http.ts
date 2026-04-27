import type { AuthResponse } from "@/features/auth/types/auth.types";
import { captureException } from "@/sentry";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_BASE = import.meta.env.VITE_API_URL ?? "";
const CSRF_COOKIE_NAME = "stima_csrf_token";
const AUTH_ERROR_MESSAGE_SNIPPETS = [
  "csrf token missing",
  "missing csrf",
  "missing access token",
  "access token missing",
  "refresh token expired",
  "invalid refresh token",
  "invalid access token",
  "authentication required",
  "not authenticated",
  "unauthorized",
  "forbidden",
] as const;

let csrfToken: string | null = null;
let refreshInFlight: Promise<void> | null = null;
let authFailureDispatchQueued = false;

export const AUTH_FAILURE_EVENT = "stima:auth-failure";

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

export interface ResponseWithMetadata<T> {
  status: number;
  data: T;
}

export class HttpRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export function isHttpRequestError(error: unknown): error is HttpRequestError {
  return error instanceof HttpRequestError;
}

function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function isJsonBody(body: RequestOptions["body"]): body is object {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const objectTag = Object.prototype.toString.call(body);

  if (
    objectTag === "[object FormData]" ||
    objectTag === "[object URLSearchParams]" ||
    objectTag === "[object Blob]" ||
    objectTag === "[object ArrayBuffer]" ||
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
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return null;
  }

  const contentType = response.headers.get("Content-Type");
  if (!contentType || !contentType.includes("application/json")) {
    return null;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  return JSON.parse(text) as unknown;
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

function shouldSignalAuthFailure(status: number, message: string): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  const normalizedMessage = message.toLowerCase();
  return AUTH_ERROR_MESSAGE_SNIPPETS.some((snippet) => normalizedMessage.includes(snippet));
}

function signalExplicitAuthFailure(status: number, message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!shouldSignalAuthFailure(status, message)) {
    return;
  }

  if (authFailureDispatchQueued) {
    return;
  }

  authFailureDispatchQueued = true;
  queueMicrotask(() => {
    authFailureDispatchQueued = false;
    window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT));
  });
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

type ResponseParser<T> = (response: Response, payload: unknown) => Promise<T> | T;

async function requestWithParser<T>(
  url: string,
  options: RequestOptions,
  parseResponse: ResponseParser<T>,
): Promise<T> {
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

  const fetchImpl =
    typeof window !== "undefined" && typeof window.fetch === "function"
      ? window.fetch.bind(window)
      : fetch;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}${url}`, {
      ...options,
      method,
      credentials: "include",
      headers: buildHeaders(method, options.headers, bodyIsJson),
      body: requestBody,
    });
  } catch (error) {
    captureException(error);
    throw error;
  }

  if (response.status === 401 && !options.skipRefresh && url !== "/api/auth/refresh") {
    try {
      await requestRefresh();
    } catch (refreshError) {
      if (isHttpRequestError(refreshError)) {
        signalExplicitAuthFailure(refreshError.status, refreshError.message);
      }
      throw refreshError;
    }

    return requestWithParser(url, {
      ...options,
      skipRefresh: true,
    }, parseResponse);
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    const fallbackMessage = response.statusText || "Request failed";
    const error = new HttpRequestError(
      getErrorMessage(payload, fallbackMessage),
      response.status,
      payload,
    );
    signalExplicitAuthFailure(error.status, error.message);
    if (response.status >= 500) {
      captureException(error);
    }
    throw error;
  }

  return parseResponse(response, payload);
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  return requestWithParser(url, options, (_, payload) => payload as T);
}

export async function requestWithMetadata<T>(
  url: string,
  options: RequestOptions = {},
): Promise<ResponseWithMetadata<T>> {
  return requestWithParser(url, options, (response, payload) => ({
    status: response.status,
    data: payload as T,
  }));
}

export async function requestBlob(url: string, options: RequestOptions = {}): Promise<Blob> {
  return requestWithParser(url, options, (response) => response.blob());
}
