import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteAllClipsForSession,
  deleteAudioClip,
  getAudioClip,
  getTotalAudioBytes,
  listClipsForSession,
  saveAudioClip,
} from "@/features/quotes/offline/audioRepository";
import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";

describe("audioRepository", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
  });

  it("round-trips clip blobs with save/get", async () => {
    const blob = new Blob(["clip-a"], { type: "audio/webm" });
    await saveAudioClip({
      clipId: "clip-1",
      sessionId: "session-1",
      userId: "user-1",
      blob,
      mimeType: blob.type,
      sizeBytes: blob.size,
      durationSeconds: 4,
      sequenceNumber: 1,
    });

    const clip = await getAudioClip("clip-1");

    expect(clip).not.toBeNull();
    expect(clip?.clipId).toBe("clip-1");
    expect(clip?.sessionId).toBe("session-1");
    expect(clip?.blob.size).toBe(blob.size);
    expect(clip?.mimeType).toBe("audio/webm");
    expect(clip?.createdAt).toEqual(expect.any(String));
  });

  it("lists metadata for one session only", async () => {
    const firstBlob = new Blob(["a"], { type: "audio/webm" });
    const secondBlob = new Blob(["b"], { type: "audio/mp4" });

    await saveAudioClip({
      clipId: "clip-a",
      sessionId: "session-a",
      userId: "user-1",
      blob: firstBlob,
      mimeType: firstBlob.type,
      sizeBytes: firstBlob.size,
      durationSeconds: 2,
      sequenceNumber: 1,
    });
    await saveAudioClip({
      clipId: "clip-b",
      sessionId: "session-a",
      userId: "user-1",
      blob: secondBlob,
      mimeType: secondBlob.type,
      sizeBytes: secondBlob.size,
      durationSeconds: 3,
      sequenceNumber: 2,
    });
    await saveAudioClip({
      clipId: "clip-other",
      sessionId: "session-b",
      userId: "user-1",
      blob: new Blob(["c"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 1,
      durationSeconds: 1,
      sequenceNumber: 1,
    });

    const clips = await listClipsForSession("session-a");

    expect(clips).toHaveLength(2);
    expect(clips[0]).toEqual(
      expect.objectContaining({
        clipId: "clip-a",
        sequenceNumber: 1,
      }),
    );
    expect(clips[1]).toEqual(
      expect.objectContaining({
        clipId: "clip-b",
        sequenceNumber: 2,
      }),
    );
    expect("blob" in clips[0]).toBe(false);
  });

  it("deletes a single clip", async () => {
    await saveAudioClip({
      clipId: "clip-1",
      sessionId: "session-1",
      userId: "user-1",
      blob: new Blob(["clip-a"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 6,
      durationSeconds: 3,
      sequenceNumber: 1,
    });

    await deleteAudioClip("clip-1");

    await expect(getAudioClip("clip-1")).resolves.toBeNull();
  });

  it("deletes all clips for a session", async () => {
    await saveAudioClip({
      clipId: "clip-1",
      sessionId: "session-1",
      userId: "user-1",
      blob: new Blob(["clip-a"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 6,
      durationSeconds: 3,
      sequenceNumber: 1,
    });
    await saveAudioClip({
      clipId: "clip-2",
      sessionId: "session-1",
      userId: "user-1",
      blob: new Blob(["clip-b"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 7,
      durationSeconds: 4,
      sequenceNumber: 2,
    });
    await saveAudioClip({
      clipId: "clip-3",
      sessionId: "session-2",
      userId: "user-1",
      blob: new Blob(["clip-c"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 8,
      durationSeconds: 5,
      sequenceNumber: 1,
    });

    await deleteAllClipsForSession("session-1");

    await expect(listClipsForSession("session-1")).resolves.toEqual([]);
    await expect(getAudioClip("clip-3")).resolves.not.toBeNull();
  });

  it("sums total bytes for a user", async () => {
    await saveAudioClip({
      clipId: "clip-1",
      sessionId: "session-1",
      userId: "user-1",
      blob: new Blob(["clip-a"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 10,
      durationSeconds: 3,
      sequenceNumber: 1,
    });
    await saveAudioClip({
      clipId: "clip-2",
      sessionId: "session-2",
      userId: "user-1",
      blob: new Blob(["clip-b"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 25,
      durationSeconds: 4,
      sequenceNumber: 2,
    });
    await saveAudioClip({
      clipId: "clip-3",
      sessionId: "session-2",
      userId: "user-2",
      blob: new Blob(["clip-c"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 99,
      durationSeconds: 5,
      sequenceNumber: 1,
    });

    await expect(getTotalAudioBytes("user-1")).resolves.toBe(35);
  });
});
