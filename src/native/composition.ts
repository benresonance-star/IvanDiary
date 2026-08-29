import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  BrowserAppleTranscriptionMock,
  BrowserAppLifecycleMock,
  BrowserCloudBackupMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
  BrowserNativeShareMock,
} from "./browserMocks";
import {
  CapacitorAppleTranscriptionAdapter,
  CapacitorAppLifecycleAdapter,
  CapacitorCloudBackupAdapter,
  CapacitorJournalAudioAdapter,
  CapacitorJournalFilesAdapter,
  CapacitorNativeShareAdapter,
  type CapacitorPluginContracts,
} from "./capacitorAdapters";
import type {
  AppleTranscriptionPlugin,
  AppLifecyclePlugin,
  CloudBackupPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
  NativeSharePlugin,
} from "./contracts";

export type JournalServices = {
  audio: JournalAudioPlugin;
  transcription: AppleTranscriptionPlugin;
  files: JournalFilesPlugin;
  lifecycle: AppLifecyclePlugin;
  backup: CloudBackupPlugin;
  share: NativeSharePlugin;
  runtime: "native" | "browser-simulation";
};

export type ServiceCompositionDependencies = {
  platform: () => string;
  nativePlugins: () => CapacitorPluginContracts;
};

function registerNativePlugins(): CapacitorPluginContracts {
  return {
    audio: registerPlugin<JournalAudioPlugin>("JournalAudio"),
    transcription: registerPlugin<AppleTranscriptionPlugin>(
      "AppleTranscription",
    ),
    files: registerPlugin<JournalFilesPlugin>("JournalFiles"),
    lifecycle: registerPlugin<AppLifecyclePlugin>("AppLifecycle"),
    backup: registerPlugin<CloudBackupPlugin>("CloudBackup"),
    share: registerPlugin<NativeSharePlugin>("NativeShare"),
  };
}

const defaultDependencies: ServiceCompositionDependencies = {
  platform: () => Capacitor.getPlatform(),
  nativePlugins: registerNativePlugins,
};

export function createAppServices(
  dependencies: ServiceCompositionDependencies = defaultDependencies,
): JournalServices {
  if (dependencies.platform() !== "ios") {
    return {
      audio: new BrowserJournalAudioMock(),
      transcription: new BrowserAppleTranscriptionMock(),
      files: new BrowserJournalFilesMock(),
      lifecycle: new BrowserAppLifecycleMock(),
      backup: new BrowserCloudBackupMock(),
      share: new BrowserNativeShareMock(),
      runtime: "browser-simulation",
    };
  }

  const plugins = dependencies.nativePlugins();
  return {
    audio: new CapacitorJournalAudioAdapter(plugins.audio),
    transcription: new CapacitorAppleTranscriptionAdapter(
      plugins.transcription,
    ),
    files: new CapacitorJournalFilesAdapter(plugins.files),
    lifecycle: new CapacitorAppLifecycleAdapter(plugins.lifecycle),
    backup: new CapacitorCloudBackupAdapter(plugins.backup),
    share: new CapacitorNativeShareAdapter(plugins.share),
    runtime: "native",
  };
}
