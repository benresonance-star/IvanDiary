import { Mic, Pause, Play, Square, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { JournalAudioPlugin, JournalFilesPlugin, RecordingSnapshot } from "../native/contracts";
import { finalizeStoppedRecording, recordingStorageAvailable } from "../native/durableAudio";

const durationLabel = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function MicrophoneMeter({ level, active }: { level: number; active: boolean }) {
  return <div aria-label={active ? "Microphone level" : "Microphone inactive"} className="voice-microphone-meter" role="img">
    {Array.from({ length: 7 }, (_, index) => {
      const wave = 1 - Math.abs(index - 3) / 4;
      const scale = active ? Math.max(0.15, Math.min(1, 0.15 + level * (0.65 + wave * 0.8))) : 0.15;
      return <span key={index} style={{ transform: `scaleY(${scale})` }} />;
    })}
  </div>;
}

export function VoiceRecordingDialog({ audio, files, initialRecording, onCancel, onPlace, recordingLimitMinutes }: {
  audio: JournalAudioPlugin;
  files: JournalFilesPlugin;
  initialRecording?: RecordingSnapshot;
  onCancel: () => void;
  onPlace: (recording: RecordingSnapshot) => void;
  recordingLimitMinutes: 2 | 5 | 10 | 30 | null;
}) {
  const [recording, setRecording] = useState(initialRecording);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewLevel, setPreviewLevel] = useState(0);
  const [status, setStatus] = useState("Ready to record");

  useEffect(() => {
    if (recording || !audio.startMonitoring || !audio.monitorLevel || !audio.stopMonitoring) return;
    let disposed = false;
    let timer: number | undefined;
    void audio.startMonitoring().then(({ powerLevel }) => {
      if (disposed) return;
      setPreviewLevel(powerLevel);
      timer = window.setInterval(() => void audio.monitorLevel!().then((value) => {
        if (!disposed) setPreviewLevel(value.powerLevel);
      }).catch(() => setPreviewLevel(0)), 120);
    }).catch(() => setStatus("Microphone preview is unavailable. You can still try to start recording."));
    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      setPreviewLevel(0);
      void audio.stopMonitoring?.().catch(() => undefined);
    };
  }, [audio, recording]);

  useEffect(() => {
    if (recording?.state !== "recording") return;
    let disposed = false;
    const timer = window.setInterval(() => void audio.status().then((next) => {
      if (!disposed) setRecording(next);
    }).catch(() => {
      if (!disposed) setStatus("The microphone status is unavailable.");
    }), 120);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [audio, recording?.state]);

  useEffect(() => {
    if (recording?.state === "finalising" && !busy) void end();
  // `end` deliberately follows the latest recording snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording?.state]);

  useEffect(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void audio.addListener("playbackEnded", () => setPlaying(false)).then((handle) => {
      if (disposed) void handle.remove(); else remove = handle.remove;
    });
    return () => { disposed = true; if (remove) void remove(); };
  }, [audio]);

  const start = async () => {
    setBusy(true);
    try {
      if (!await recordingStorageAvailable(files)) { setStatus("Storage is too low to record safely."); return; }
      setRecording(await audio.start({ maximumDurationMs: recordingLimitMinutes === null ? undefined : recordingLimitMinutes * 60_000 }));
      setStatus("Recording. The microphone bars show that your voice is being heard.");
    } catch { setStatus("Recording could not start. Check microphone permission and storage."); }
    finally { setBusy(false); }
  };

  const togglePause = async () => {
    if (!recording) return;
    setBusy(true);
    try {
      const next = recording.state === "recording" ? await audio.pauseRecording?.() : await audio.resumeRecording?.();
      if (!next) throw new Error("Pause unavailable");
      setRecording(next);
      setStatus(next.state === "paused" ? "Recording paused." : "Recording resumed.");
    } catch { setStatus("The recording could not be paused or resumed."); }
    finally { setBusy(false); }
  };

  const end = async () => {
    if (!recording) return;
    setBusy(true); setStatus("Saving the recording…");
    try { setRecording(await finalizeStoppedRecording(audio, files)); setStatus("Recording saved. Listen before placing it on the canvas."); }
    catch { setStatus("The recording could not be finalized. It remains recoverable."); }
    finally { setBusy(false); }
  };

  const discard = async () => {
    if (recording?.asset) await files.removeToTrash({ assetId: recording.asset.id }).catch(() => undefined);
    setRecording(undefined); setPlaying(false); setStatus("Ready to record");
  };
  const cancel = async () => {
    if (recording?.state === "recording" || recording?.state === "paused" || recording?.state === "interrupted") { await end(); return; }
    if (recording?.asset) await files.removeToTrash({ assetId: recording.asset.id }).catch(() => undefined);
    onCancel();
  };
  const reviewing = recording?.state === "saved" && Boolean(recording.asset);
  const active = recording?.state === "recording";
  const paused = recording?.state === "paused" || recording?.state === "interrupted";

  return <div aria-labelledby="voice-recording-title" aria-modal="true" className="voice-recording-backdrop" role="dialog">
    <section className="voice-recording-dialog">
      <header><div><h2 id="voice-recording-title">Voice recording</h2><p>Record, listen, then place it on your canvas.</p></div><button aria-label="Close voice recording" className="secondary-action" disabled={busy} onClick={() => void cancel()} type="button"><X aria-hidden="true" /></button></header>
      <MicrophoneMeter active={active || (!recording && previewLevel > 0)} level={recording?.powerLevel ?? previewLevel} />
      <strong className="voice-recording-time">{durationLabel(recording?.elapsedMs ?? 0)}</strong>
      {!reviewing ? <div className="voice-recording-actions">
        {!recording ? <button className="large-action" disabled={busy} onClick={() => void start()} type="button"><Mic aria-hidden="true" />Start recording</button> : <button className="large-action" disabled={busy} onClick={() => void togglePause()} type="button">{active ? <Pause aria-hidden="true" /> : <Mic aria-hidden="true" />}{active ? "Pause recording" : "Resume recording"}</button>}
        {active || paused ? <button className="voice-end-action" disabled={busy} onClick={() => void end()} type="button"><Square aria-hidden="true" />End recording</button> : null}
      </div> : <div className="voice-review">
        <button className="voice-preview-action" onClick={() => void (playing ? audio.pausePlayback().then(() => setPlaying(false)) : audio.play({ assetUri: recording.asset!.localUri }).then(() => setPlaying(true)))} type="button">{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? "Pause preview" : "Play recording"}</button>
        <div className="voice-review-actions"><button className="secondary-action" onClick={() => void discard()} type="button"><Trash2 aria-hidden="true" />Record again</button><button className="large-action" onClick={() => onPlace(recording)} type="button">Place recording</button></div>
      </div>}
      <p aria-live="polite" className="voice-recording-status" role="status">{status}</p>
    </section>
  </div>;
}
