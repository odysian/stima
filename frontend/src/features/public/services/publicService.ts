import { captureException } from "@/sentry";

import type { PublicQuote } from "@/features/public/types/public.types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class PublicRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublicRequestError";
    this.status = status;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
  }

  return fallback;
}

async function parsePayload(response: Response): Promise<unknown> {
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

async function getQuote(token: string): Promise<PublicQuote> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/public/doc/${token}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    captureException(error);
    throw error;
  }

  const payload = await parsePayload(response);
  if (!response.ok) {
    const requestError = new PublicRequestError(
      getErrorMessage(payload, response.statusText || "Request failed"),
      response.status,
    );
    if (response.status >= 500) {
      captureException(requestError);
    }
    throw requestError;
  }

  return payload as PublicQuote;
}

export const publicService = {
  getQuote,
};
