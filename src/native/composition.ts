import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  BrowserAppleTranscriptionMock,
  BrowserAppLifecycleMock,
  BrowserCloudBackupMock,
  BrowserJournalAudioMock,
  BrowserJournalFilesMock,
} from "./browserMocks";
import {
  CapacitorAppleTranscriptionAdapter,
  CapacitorAppLifecycleAdapter,
  CapacitorCloudBackupAdapter,
  CapacitorJournalAudioAdapter,
  CapacitorJournalFilesAdapter,
  type CapacitorPluginContracts,
} from "./capacitorAdapters";
import type {
  AppleTranscriptionPlugin,
  AppLifecyclePlugin,
  CloudBackupPlugin,
  JournalAudioPlugin,
  JournalFilesPlugin,
} from "./contracts";

export type JournalServices = {
  audio: JournalAudioPlugin;
  transcription: AppleTranscriptionPlugin;
  files: JournalFilesPlugin;
  lifecycle: AppLifecyclePlugin;
  backup: CloudBackupPlugin;
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
    runtime: "native",
  };
}
