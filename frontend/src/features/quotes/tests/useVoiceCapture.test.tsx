import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);

  public state: "inactive" | "recording" = "inactive";
  public readonly mimeType: string;
  public ondataavailable: ((event: BlobEvent) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    if (this.state === "inactive") {
      return;
    }

    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["clip-audio"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.();
  }
}

describe("useVoiceCapture", () => {
  const createObjectUrlMock = vi.fn(() => "blob:test-clip");
  const revokeObjectUrlMock = vi.fn();
  const stopTrackMock = vi.fn();
  const getUserMediaMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    stopTrackMock.mockReset();
    getUserMediaMock.mockResolvedValue({
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });

    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("handles recording lifecycle and accumulates clips", async () => {
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current.elapsedSeconds).toBe(2);

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.clips).toHaveLength(1);
    expect(result.current.clips[0]?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(stopTrackMock).toHaveBeenCalledTimes(1);
  });

  it("removes individual clips and revokes object URLs", async () => {
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    const clipId = result.current.clips[0]?.id;
    expect(clipId).toBeDefined();

    act(() => {
      result.current.removeClip(clipId ?? "");
    });

    expect(result.current.clips).toHaveLength(0);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:test-clip");
  });

  it("clears all clips and revokes each URL", async () => {
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.clips).toHaveLength(2);

    act(() => {
      result.current.clearClips();
    });

    expect(result.current.clips).toHaveLength(0);
    expect(revokeObjectUrlMock).toHaveBeenCalledTimes(2);
  });

  it("keeps clip sequence numbers stable after deleting earlier clips", async () => {
    const { result } = renderHook(() => useVoiceCapture());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.clips).toHaveLength(2);
    expect(result.current.clips[0]?.sequenceNumber).toBe(1);
    expect(result.current.clips[1]?.sequenceNumber).toBe(2);

    const firstClipId = result.current.clips[0]?.id;
    expect(firstClipId).toBeDefined();

    act(() => {
      result.current.removeClip(firstClipId ?? "");
    });

    expect(result.current.clips).toHaveLength(1);
    expect(result.current.clips[0]?.sequenceNumber).toBe(2);
  });
});
