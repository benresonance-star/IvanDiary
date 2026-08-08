import { describe, expect, it, vi } from "vitest";

import {
  BrowserAppleTranscriptionMock,
  BrowserAppLifecycleMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "./browserMocks";
import {
  CapacitorAppleTranscriptionAdapter,
  CapacitorAppLifecycleAdapter,
  CapacitorJournalAudioAdapter,
  CapacitorJournalFilesAdapter,
  type CapacitorPluginContracts,
} from "./capacitorAdapters";
import { createAppServices } from "./composition";
import type {
  AppLifecyclePlugin,
  AppleTranscriptionPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  RecordingSnapshot,
} from "./contracts";
import { JournalServiceError } from "./errors";

const RECORDING: RecordingSnapshot = {
  id: "recording-1",
  state: "saved",
  elapsedMs: 1234,
  asset: {
    id: "asset-1",
    localUri: "file:///recording.m4a",
    mimeType: "audio/mp4",
    byteLength: 1024,
    checksum: "checksum-1",
  },
};

function pluginDoubles(): CapacitorPluginContracts {
  return {
    audio: {
      start: vi.fn(async () => RECORDING),
      status: vi.fn(async () => RECORDING),
      stop: vi.fn(async () => RECORDING),
      recoverInterrupted: vi.fn(async () => ({ recordings: [RECORDING] })),
    },
    transcription: {
      requestPermission: vi.fn(async () => ({ granted: true })),
      transcribe: vi.fn(async ({ recordingId }) => ({
        recordingId,
        rawText: "A transcript",
        locale: "en-AU",
        engine: "apple-speech" as const,
      })),
    },
    files: {
      finaliseTemporaryAsset: vi.fn(async ({ assetId, mimeType }) => ({
        id: assetId,
        localUri: `file:///${assetId}`,
        mimeType,
        byteLength: 1024,
        checksum: "checksum-1",
      })),
      removeToTrash: vi.fn(async () => undefined),
      storageHealth: vi.fn(async () => ({
        availableBytes: 4096,
        lowStorage: false,
      })),
    },
    lifecycle: {
      flushRequested: vi.fn(async () => ({
        requestedAt: "2026-08-08T00:00:00.000Z",
      })),
    },
  };
}

describe("service composition", () => {
  it("selects explicit browser simulations outside iOS", () => {
    const nativePlugins = vi.fn(pluginDoubles);
    const services = createAppServices({
      platform: () => "web",
      nativePlugins,
    });

    expect(services.runtime).toBe("browser-simulation");
    expect(services.audio).toBeInstanceOf(BrowserJournalAudioMock);
    expect(services.transcription).toBeInstanceOf(
      BrowserAppleTranscriptionMock,
    );
    expect(services.files).toBeInstanceOf(BrowserJournalFilesMock);
    expect(services.lifecycle).toBeInstanceOf(BrowserAppLifecycleMock);
    expect(nativePlugins).not.toHaveBeenCalled();
  });

  it("selects Capacitor adapters on iOS", () => {
    const services = createAppServices({
      platform: () => "ios",
      nativePlugins: pluginDoubles,
    });

    expect(services.runtime).toBe("native");
    expect(services.audio).toBeInstanceOf(CapacitorJournalAudioAdapter);
    expect(services.transcription).toBeInstanceOf(
      CapacitorAppleTranscriptionAdapter,
    );
    expect(services.files).toBeInstanceOf(CapacitorJournalFilesAdapter);
    expect(services.lifecycle).toBeInstanceOf(CapacitorAppLifecycleAdapter);
  });
});

describe("Capacitor service adapters", () => {
  it("forwards audio methods and returns stable recording shapes", async () => {
    const plugin = pluginDoubles().audio;
    const adapter = new CapacitorJournalAudioAdapter(plugin);

    await expect(adapter.start({ preferredFormat: "m4a" })).resolves.toEqual(
      RECORDING,
    );
    await adapter.status();
    await adapter.stop();
    await expect(adapter.recoverInterrupted()).resolves.toEqual({
      recordings: [RECORDING],
    });

    expect(plugin.start).toHaveBeenCalledWith({ preferredFormat: "m4a" });
    expect(plugin.status).toHaveBeenCalledWith();
    expect(plugin.stop).toHaveBeenCalledWith();
    expect(plugin.recoverInterrupted).toHaveBeenCalledWith();
  });

  it("forwards transcription, file, and lifecycle methods", async () => {
    const plugins = pluginDoubles();
    const transcription = new CapacitorAppleTranscriptionAdapter(
      plugins.transcription,
    );
    const files = new CapacitorJournalFilesAdapter(plugins.files);
    const lifecycle = new CapacitorAppLifecycleAdapter(plugins.lifecycle);
    const transcriptionOptions = {
      recordingId: "recording-1",
      asset: RECORDING.asset!,
      locale: "en-AU",
    };
    const fileOptions = {
      temporaryUri: "file:///temporary.m4a",
      assetId: "asset-1",
      mimeType: "audio/mp4",
    };

    await expect(transcription.requestPermission()).resolves.toEqual({
      granted: true,
    });
    await expect(transcription.transcribe(transcriptionOptions)).resolves.toEqual(
      {
        recordingId: "recording-1",
        rawText: "A transcript",
        locale: "en-AU",
        engine: "apple-speech",
      },
    );
    await files.finaliseTemporaryAsset(fileOptions);
    await files.removeToTrash({ assetId: "asset-1" });
    await expect(files.storageHealth()).resolves.toEqual({
      availableBytes: 4096,
      lowStorage: false,
    });
    await expect(lifecycle.flushRequested()).resolves.toEqual({
      requestedAt: "2026-08-08T00:00:00.000Z",
    });

    expect(plugins.transcription.transcribe).toHaveBeenCalledWith(
      transcriptionOptions,
    );
    expect(plugins.files.finaliseTemporaryAsset).toHaveBeenCalledWith(
      fileOptions,
    );
    expect(plugins.files.removeToTrash).toHaveBeenCalledWith({
      assetId: "asset-1",
    });
    expect(plugins.lifecycle.flushRequested).toHaveBeenCalledWith();
  });

  it.each([
    ["PERMISSION_DENIED", "permission-denied", false],
    ["INTERRUPTED", "interrupted", true],
    ["LOW_STORAGE", "low-storage", true],
    ["ASSET_MISSING", "asset-missing", false],
    ["ASSET_CORRUPT", "asset-corrupt", false],
    ["UNAVAILABLE", "service-unavailable", false],
    ["SOMETHING_NEW", "native-failure", true],
  ])("normalizes native %s failures", async (nativeCode, code, retryable) => {
    const plugin: JournalAudioPlugin = {
      ...pluginDoubles().audio,
      start: vi.fn(async () => {
        throw { code: nativeCode, message: "Native detail" };
      }),
    };

    const failure = await new CapacitorJournalAudioAdapter(plugin)
      .start()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(JournalServiceError);
    expect((failure as JournalServiceError).details).toMatchObject({
      code,
      retryable,
      service: "audio",
    });
    expect((failure as JournalServiceError).details.action).not.toBe("");
  });

  it("keeps every adapter assignable to its domain contract", () => {
    const plugins = pluginDoubles();
    const audio: JournalAudioPlugin = new CapacitorJournalAudioAdapter(
      plugins.audio,
    );
    const transcription: AppleTranscriptionPlugin =
      new CapacitorAppleTranscriptionAdapter(plugins.transcription);
    const files: JournalFilesPlugin = new CapacitorJournalFilesAdapter(
      plugins.files,
    );
    const lifecycle: AppLifecyclePlugin = new CapacitorAppLifecycleAdapter(
      plugins.lifecycle,
    );

    expect({ audio, transcription, files, lifecycle }).toBeDefined();
  });
});
