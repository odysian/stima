import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import {
  clearDocumentDraftFromIDB,
  persistDocumentDraftToIDB,
  readDocumentDraftFromIDB,
  type DocumentEditDraft,
} from "@/features/quotes/hooks/persistedDocumentDraft";

const EDIT_STORAGE_KEY = "stima_document_edit";

const draftFixture: DocumentEditDraft = {
  documentId: "doc-1",
  docType: "quote",
  title: "Spring cleanup",
  transcript: "Mulch and edging",
  lineItems: [
    {
      description: "Mulch",
      details: "5 yards",
      price: 120,
      flagged: false,
      flagReason: null,
    },
  ],
  total: 120,
  taxRate: null,
  discountType: null,
  discountValue: null,
  depositAmount: null,
  notes: "Thanks",
  dueDate: "",
};

describe("persistedDocumentDraft", () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    window.sessionStorage.clear();
    await resetCaptureDbForTests();
  });

  it("round-trips drafts through IndexedDB", async () => {
    await persistDocumentDraftToIDB(draftFixture, "user-a");

    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-a")).resolves.toEqual(draftFixture);
  });

  it("returns null for missing drafts or wrong users", async () => {
    await persistDocumentDraftToIDB(draftFixture, "user-a");

    await expect(readDocumentDraftFromIDB("missing", "quote", "user-a")).resolves.toBeNull();
    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-b")).resolves.toBeNull();
  });

  it("migrates a legacy sessionStorage draft once and clears the old key", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(draftFixture));

    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-a")).resolves.toEqual(draftFixture);
    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();

    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-a")).resolves.toEqual(draftFixture);
  });

  it("handles corrupt migration payloads safely", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, "{bad json");

    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-a")).resolves.toBeNull();
    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
  });

  it("clears drafts by document id + type key", async () => {
    await persistDocumentDraftToIDB(draftFixture, "user-a");
    await clearDocumentDraftFromIDB("doc-1", "quote");

    await expect(readDocumentDraftFromIDB("doc-1", "quote", "user-a")).resolves.toBeNull();
  });
});
