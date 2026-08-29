import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JournalAudioPlugin, JournalFilesPlugin, RecordingSnapshot } from "../native/contracts";
import { finalizeStoppedRecording, recordingStorageAvailable } from "../native/durableAudio";

const durationLabel = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function MicrophoneMeter({ level, mode }: { level: number; mode: "ready" | "recording" | "inactive" }) {
  return <div
    aria-label={mode === "ready" ? "Microphone ready" : mode === "recording" ? "Microphone level" : "Microphone inactive"}
    className={`voice-microphone-meter ${mode}`}
    role="img"
  >
    {Array.from({ length: 7 }, (_, index) => {
      const wave = 1 - Math.abs(index - 3) / 4;
      const scale = mode === "recording" ? Math.max(0.15, Math.min(1, 0.15 + level * (0.65 + wave * 0.8))) : 0.15;
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
  const [status, setStatus] = useState("Ready to record");
  const autoFinalisingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const finalizationRef = useRef<Promise<RecordingSnapshot> | undefined>(undefined);
  const playbackListenerRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const finalize = useCallback(() => {
    finalizationRef.current ??= finalizeStoppedRecording(audio, files).finally(() => {
      finalizationRef.current = undefined;
    });
    return finalizationRef.current;
  }, [audio, files]);

  const trashRecording = useCallback(async (snapshot?: RecordingSnapshot) => {
    if (snapshot?.asset) await files.removeToTrash({ assetId: snapshot.asset.id }).catch(() => undefined);
  }, [files]);

  const end = useCallback(async () => {
    setBusy(true); setStatus("Saving the recording…");
    try {
      const saved = await finalize();
      if (cancelRequestedRef.current) await trashRecording(saved);
      else { setRecording(saved); setStatus("Recording saved. Listen before placing it on the canvas."); }
    }
    catch { setStatus("The recording could not be finalized. It remains recoverable."); }
    finally { setBusy(false); }
  }, [finalize, trashRecording]);

  const finalizeAndPlace = useCallback(async () => {
    setBusy(true); setStatus("Saving the recording…");
    try {
      const saved = await finalize();
      if (cancelRequestedRef.current) await trashRecording(saved);
      else onPlace(saved);
    } catch {
      setStatus("The recording could not be finalized. It remains recoverable.");
    } finally {
      setBusy(false);
    }
  }, [finalize, onPlace, trashRecording]);

  useEffect(() => {
    if (recording?.state !== "recording") return;
    let disposed = false;
    const timer = window.setInterval(() => void audio.status().then((next) => {
      if (disposed) return;
      if (next.state === "finalising") {
        if (!autoFinalisingRef.current) {
          autoFinalisingRef.current = true;
          void end().finally(() => { autoFinalisingRef.current = false; });
        }
      } else {
        setRecording(next);
      }
    }).catch(() => {
      if (!disposed) setStatus("The microphone status is unavailable.");
    }), 120);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [audio, end, recording?.state]);

  useEffect(() => () => {
    const remove = playbackListenerRef.current;
    playbackListenerRef.current = undefined;
    if (remove) void remove();
  }, []);

  const togglePlayback = async (assetUri: string) => {
    if (playing) {
      await audio.pausePlayback();
      setPlaying(false);
      return;
    }
    if (!playbackListenerRef.current) {
      const handle = await audio.addListener(
        "playbackEnded",
        () => setPlaying(false),
      );
      playbackListenerRef.current = handle.remove;
    }
    await audio.play({ assetUri });
    setPlaying(true);
  };

  const start = async () => {
    setBusy(true);
    try {
      // Do not overlap the idle microphone preview with the real recorder.
      // Native cleanup is also generation-guarded, but awaiting it here keeps
      // the audio-session transition deterministic across the bridge.
      await audio.stopMonitoring?.();
      if (!await recordingStorageAvailable(files)) { setStatus("Storage is too low to record safely."); return; }
      const started = await audio.start({ maximumDurationMs: recordingLimitMinutes === null ? undefined : recordingLimitMinutes * 60_000 });
      if (cancelRequestedRef.current) {
        const saved = await finalize().catch(() => undefined);
        await trashRecording(saved);
        return;
      }
      setRecording(started);
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

  const discard = async () => {
    if (recording?.asset) await files.removeToTrash({ assetId: recording.asset.id }).catch(() => undefined);
    setRecording(undefined); setPlaying(false); setStatus("Ready to record");
  };
  const cancel = () => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    onCancel();
    setPlaying(false);
    if (playing) void audio.pausePlayback().catch(() => undefined);
    void (async () => {
      if (recording?.asset) { await trashRecording(recording); return; }
      if (recording || busy) {
        const saved = await finalize().catch(() => undefined);
        await trashRecording(saved);
      }
    })();
  };
  const reviewing = recording?.state === "saved" && Boolean(recording.asset);
  const active = recording?.state === "recording";
  const paused = recording?.state === "paused";
  const interrupted = recording?.state === "interrupted";
  const microphoneMode = !recording && !busy ? "ready" : active ? "recording" : "inactive";

  return <div aria-labelledby="voice-recording-title" aria-modal="true" className="voice-recording-backdrop" role="dialog">
    <section className="voice-recording-dialog">
      <header><div><h2 id="voice-recording-title">Voice recording</h2><p>Record, listen, then place it on your canvas.</p></div><button aria-label="Cancel voice recording" className="secondary-action" onClick={cancel} type="button">Cancel</button></header>
      <MicrophoneMeter level={recording?.powerLevel ?? 0} mode={microphoneMode} />
      <strong className="voice-recording-time">{durationLabel(recording?.elapsedMs ?? 0)}</strong>
      {!reviewing ? <div className="voice-recording-actions">
        {!recording ? <button className="large-action" disabled={busy} onClick={() => void start()} type="button"><Mic aria-hidden="true" />Start recording</button> : active || paused ? <button className="large-action" disabled={busy} onClick={() => void togglePause()} type="button">{active ? <Pause aria-hidden="true" /> : <Mic aria-hidden="true" />}{active ? "Pause recording" : "Resume recording"}</button> : null}
        {active ? <button className="voice-end-action" disabled={busy} onClick={() => void end()} type="button"><Square aria-hidden="true" />End recording</button> : null}
        {paused || interrupted ? <button className="voice-end-action" disabled={busy} onClick={() => void finalizeAndPlace()} type="button"><Square aria-hidden="true" />Place recording</button> : null}
      </div> : <div className="voice-review">
        <button className="voice-preview-action" onClick={() => void togglePlayback(recording.asset!.localUri)} type="button">{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? "Pause preview" : "Play recording"}</button>
        <div className="voice-review-actions"><button className="secondary-action" onClick={() => void discard()} type="button"><Trash2 aria-hidden="true" />Record again</button><button className="large-action" onClick={() => onPlace(recording)} type="button">Place recording</button></div>
      </div>}
      <p aria-live="polite" className="voice-recording-status" role="status">{status}</p>
    </section>
  </div>;
}
