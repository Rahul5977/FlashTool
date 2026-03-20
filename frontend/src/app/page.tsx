"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ConfigPanel from "@/components/ConfigPanel";
import PromptEditor from "@/components/PromptEditor";
import VideoResult from "@/components/VideoResult";
import CharacterUpload from "@/components/CharacterUpload";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface CharacterAnalysis {
  appearance: string;
  outfit: string;
}

export interface ClipPrompt {
  clip: number;
  scene_summary: string;
  last_frame: string;
  prompt: string;
}

type Phase = "input" | "review" | "generating" | "result";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 5000;

/* ─── Job Status Type ───────────────────────────────────────────────────── */

interface JobStatus {
  job_id: string;
  status: "pending" | "running" | "done" | "failed";
  progress: number;
  current_clip: number;
  total_clips: number;
  message: string;
  video_url?: string;
  clip_paths?: string[];
  error?: string;
}

/* ─── Worker Session Type ───────────────────────────────────────────────── */

interface WorkerSession {
  id: string;
  label: string;
  phase: Phase;
  loading: boolean;
  error: string | null;
  script: string;
  extraPrompt: string;
  numClips: number;
  durationLabel: string;
  aspectRatio: string;
  veoModel: string;
  languageNote: boolean;
  usePhotos: boolean;
  characters: { name: string; file: File | null }[];
  photoAnalyses: Record<string, CharacterAnalysis>;
  clips: ClipPrompt[];
  characterSheet: string;
  jobId: string | null;
  jobStatus: JobStatus | null;
  videoUrl: string;
  clipPaths: string[];
}

let _uidCounter = 1;
function nextUid() { _uidCounter += 1; return _uidCounter; }

function createSession(uid: number): WorkerSession {
  return {
    id: `s${uid}`,
    label: `Worker ${uid}`,
    phase: "input",
    loading: false,
    error: null,
    script: "",
    extraPrompt: "",
    numClips: 6,
    durationLabel: "45s",
    aspectRatio: "9:16 (Reels / Shorts)",
    veoModel: "veo-3.1-generate-preview",
    languageNote: true,
    usePhotos: false,
    characters: [{ name: "", file: null }, { name: "", file: null }],
    photoAnalyses: {},
    clips: [],
    characterSheet: "",
    jobId: null,
    jobStatus: null,
    videoUrl: "",
    clipPaths: [],
  };
}

/* ─── Spinner ───────────────────────────────────────────────────────────── */

function Spinner({ size = 5 }: { size?: number }) {
  const cls = `h-${size} w-${size}`;
  return (
    <svg className={`${cls} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ─── Generating Progress Panel ─────────────────────────────────────────── */

function GeneratingPanel({ session, onCancel }: { session: WorkerSession; onCancel: () => void }) {
  const js = session.jobStatus;
  const progress = js?.progress ?? 0;
  const currentClip = js?.current_clip ?? 0;
  const totalClips = js?.total_clips ?? session.numClips;
  const message = js?.message ?? "Starting…";
  const status = js?.status ?? "pending";
  const failed = status === "failed";

  return (
    <div className="mx-auto max-w-xl">
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(37,168,90,0.25)" }}
      >
        <div className="mb-6 flex justify-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: "rgba(37,168,90,0.12)" }}
          >
            <span className="text-4xl">{failed ? "❌" : "🎬"}</span>
          </div>
        </div>

        <h2 className="mb-2 text-xl font-bold text-white">
          {failed ? "Generation Failed" : `${session.label} — Generating Video`}
        </h2>

        {!failed && (
          <p className="mb-6 text-sm text-white/50">
            Veo renders each clip in ~3–6 minutes. You can switch to other workers while this runs.
          </p>
        )}

        {/* Progress bar */}
        {!failed && (
          <div className="mb-4">
            <div className="mb-2 flex justify-between text-xs text-white/40">
              <span>{currentClip > 0 ? `Clip ${currentClip} / ${totalClips}` : "Initializing…"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #1a7a3c, #25a85a)" }}
                animate={{ width: `${Math.max(progress, 3)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Clip bubbles */}
        {!failed && totalClips > 0 && (
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            {Array.from({ length: totalClips }).map((_, i) => {
              const clipNum = i + 1;
              const done = currentClip > clipNum;
              const active = currentClip === clipNum && status === "running";
              return (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all"
                  style={{
                    background: done ? "rgba(37,168,90,0.8)" : active ? "rgba(37,168,90,0.3)" : "rgba(255,255,255,0.08)",
                    color: done ? "#fff" : active ? "#7ecfa0" : "rgba(255,255,255,0.3)",
                    border: active ? "1px solid rgba(37,168,90,0.6)" : "1px solid transparent",
                  }}
                >
                  {done ? "✓" : clipNum}
                </div>
              );
            })}
          </div>
        )}

        {/* Status message */}
        <div
          className="mb-6 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: failed ? "#f87171" : "rgba(255,255,255,0.65)",
          }}
        >
          {failed ? (
            <>
              <p className="font-semibold">Error</p>
              <p className="mt-1 text-xs">{js?.error ?? "Unknown error"}</p>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Spinner size={4} />
              <span>{message}</span>
            </div>
          )}
        </div>

        {!failed && (
          <p className="mb-4 text-xs text-white/25">Checking progress every 5 seconds…</p>
        )}

        <button
          onClick={onCancel}
          className="rounded-lg border border-white/15 px-4 py-2 text-xs text-white/40 transition hover:bg-white/5 hover:text-white"
        >
          {failed ? "← Back to Prompts" : "Cancel / Start Over"}
        </button>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function Home() {
  const [sessions, setSessions] = useState<WorkerSession[]>([createSession(1)]);
  const [activeSessionId, setActiveSessionId] = useState<string>("s1");
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const activeSession = sessions.find((s) => s.id === activeSessionId)!;

  useEffect(() => () => { Object.values(pollRefs.current).forEach(clearInterval); }, []);

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  const updateSession = useCallback((id: string, patch: Partial<WorkerSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // Read the freshest copy of a session without relying on closure
  const readSession = useCallback(
    (id: string): Promise<WorkerSession> =>
      new Promise((resolve, reject) => {
        setSessions((prev) => {
          const found = prev.find((s) => s.id === id);
          if (found) resolve({ ...found });
          else reject(new Error(`Session ${id} not found`));
          return prev; // no state mutation
        });
      }),
    []
  );

  const addWorker = useCallback(() => {
    const uid = nextUid();
    const s = createSession(uid);
    setSessions((prev) => [...prev, s]);
    setActiveSessionId(s.id);
  }, []);

  const removeWorker = useCallback(
    (id: string) => {
      if (pollRefs.current[id]) { clearInterval(pollRefs.current[id]); delete pollRefs.current[id]; }
      setSessions((prev) => {
        if (prev.length <= 1) return prev;
        const kept = prev.filter((s) => s.id !== id);
        const relabeled = kept.map((s, i) => ({ ...s, label: `Worker ${i + 1}` }));
        if (activeSessionId === id) setActiveSessionId(relabeled[0].id);
        return relabeled;
      });
    },
    [activeSessionId]
  );

  /* ── Polling ──────────────────────────────────────────────────────────── */

  const startPolling = useCallback(
    (sessionId: string, jobId: string) => {
      if (pollRefs.current[sessionId]) clearInterval(pollRefs.current[sessionId]);

      const poll = async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/job-status/${jobId}`);
          if (!resp.ok) { console.warn(`Poll ${resp.status} — retrying`); return; }
          const status: JobStatus = await resp.json();

          updateSession(sessionId, { jobStatus: status });

          if (status.status === "done" && status.video_url) {
            clearInterval(pollRefs.current[sessionId]);
            delete pollRefs.current[sessionId];
            updateSession(sessionId, {
              phase: "result",
              videoUrl: `${API_BASE}${status.video_url}`,
              clipPaths: status.clip_paths ?? [],
              jobId: null,
            });
          } else if (status.status === "failed") {
            clearInterval(pollRefs.current[sessionId]);
            delete pollRefs.current[sessionId];
            // Stay on "generating" — GeneratingPanel shows the error + cancel button
          }
        } catch (err) {
          console.warn("Poll error (will retry):", err);
        }
      };

      poll(); // immediate first check
      pollRefs.current[sessionId] = setInterval(poll, POLL_INTERVAL_MS);
    },
    [updateSession]
  );

  /* ── Phase 1 → 2: Generate Prompts ───────────────────────────────────── */

  const handleGeneratePrompts = useCallback(
    async (sessionId: string) => {
      const s = await readSession(sessionId);
      if (!s.script.trim()) {
        updateSession(sessionId, { error: "Please paste your ad script before generating." });
        return;
      }
      updateSession(sessionId, { error: null, loading: true });

      try {
        let analyses: Record<string, CharacterAnalysis> = {};
        if (s.usePhotos) {
          const validChars = s.characters.filter((c) => c.name.trim() && c.file);
          if (validChars.length > 0) {
            const fd = new FormData();
            for (const c of validChars) { fd.append("names", c.name.trim()); fd.append("photos", c.file!); }
            const r = await fetch(`${API_BASE}/api/analyze-characters`, { method: "POST", body: fd });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Character analysis failed"); }
            analyses = (await r.json()).analyses;
            updateSession(sessionId, { photoAnalyses: analyses });
          }
        }

        const resp = await fetch(`${API_BASE}/api/generate-prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: s.script,
            extra_prompt: s.extraPrompt,
            photo_analyses: analyses,
            aspect_ratio: s.aspectRatio,
            num_clips: s.numClips,
            language_note: s.languageNote,
            has_photos: s.usePhotos && Object.keys(analyses).length > 0,
          }),
        });
        if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Prompt generation failed"); }
        const data = await resp.json();
        updateSession(sessionId, { clips: data.clips, characterSheet: data.character_sheet || "", phase: "review" });
      } catch (e: unknown) {
        updateSession(sessionId, { error: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        updateSession(sessionId, { loading: false });
      }
    },
    [readSession, updateSession]
  );

  /* ── Phase 2 → 3: Start async video generation ────────────────────────── */

  const handleGenerateVideo = useCallback(
    async (sessionId: string) => {
      const s = await readSession(sessionId);
      updateSession(sessionId, { error: null });

      const arMap: Record<string, string> = {
        "9:16 (Reels / Shorts)": "9:16",
        "16:9 (YouTube / Landscape)": "16:9",
      };

      try {
        // This endpoint returns {job_id} immediately — does NOT block
        const resp = await fetch(`${API_BASE}/api/generate-video-async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clips: s.clips,
            veo_model: s.veoModel,
            aspect_ratio: arMap[s.aspectRatio] || "9:16",
            num_clips: s.numClips,
          }),
        });
        if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Failed to start video generation"); }
        const { job_id } = await resp.json();

        updateSession(sessionId, {
          phase: "generating",
          jobId: job_id,
          jobStatus: {
            job_id,
            status: "pending",
            progress: 0,
            current_clip: 0,
            total_clips: s.numClips,
            message: "Job queued, starting Veo rendering…",
          },
        });

        startPolling(sessionId, job_id);
      } catch (e: unknown) {
        updateSession(sessionId, { error: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [readSession, updateSession, startPolling]
  );

  /* ── Phase 3: Regenerate clips (async) ───────────────────────────────── */

  const handleRegenerate = useCallback(
    async (sessionId: string, indices: number[]) => {
      const s = await readSession(sessionId);
      updateSession(sessionId, { error: null });

      const arMap: Record<string, string> = {
        "9:16 (Reels / Shorts)": "9:16",
        "16:9 (YouTube / Landscape)": "16:9",
      };

      try {
        const resp = await fetch(`${API_BASE}/api/regenerate-clips-async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clip_indices: indices,
            clips: s.clips,
            clip_paths: s.clipPaths,
            veo_model: s.veoModel,
            aspect_ratio: arMap[s.aspectRatio] || "9:16",
            num_clips: s.numClips,
          }),
        });
        if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || "Failed to start regeneration"); }
        const { job_id } = await resp.json();

        updateSession(sessionId, {
          phase: "generating",
          jobId: job_id,
          jobStatus: {
            job_id,
            status: "pending",
            progress: 0,
            current_clip: 0,
            total_clips: indices.length,
            message: `Regenerating clip(s) ${indices.map((i) => i + 1).join(", ")}…`,
          },
        });

        startPolling(sessionId, job_id);
      } catch (e: unknown) {
        updateSession(sessionId, { error: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [readSession, updateSession, startPolling]
  );

  /* ── Cancel generating ────────────────────────────────────────────────── */

  const handleCancelGeneration = useCallback(
    (sessionId: string) => {
      if (pollRefs.current[sessionId]) { clearInterval(pollRefs.current[sessionId]); delete pollRefs.current[sessionId]; }
      updateSession(sessionId, { phase: "review", jobId: null, jobStatus: null, error: null });
    },
    [updateSession]
  );

  /* ── Reset ────────────────────────────────────────────────────────────── */

  const handleReset = useCallback((sessionId: string) => {
    if (pollRefs.current[sessionId]) { clearInterval(pollRefs.current[sessionId]); delete pollRefs.current[sessionId]; }
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const match = s.label.match(/\d+/);
        const uid = match ? parseInt(match[0], 10) : _uidCounter;
        const fresh = createSession(uid);
        return { ...fresh, id: s.id, label: s.label };
      })
    );
  }, []);

  /* ── Render ───────────────────────────────────────────────────────────── */

  const s = activeSession;
  const isRunning = (sess: WorkerSession) => sess.loading || sess.phase === "generating";

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">

        {/* Header */}
        <div
          className="mb-6 flex items-center gap-4 rounded-2xl px-6 py-5"
          style={{ background: "linear-gradient(90deg, #1a7a3c, #25a85a)", boxShadow: "0 4px 24px rgba(26,122,60,0.35)" }}
        >
          <span className="text-4xl">🎬</span>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">SuperLiving — Ad Generator</h1>
            <p className="mt-0.5 text-sm text-white/80">
              Transform your scripts into high-impact video ads for Tier 3 &amp; 4 India · Powered by AI
            </p>
          </div>
        </div>

        {/* Worker Tabs */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {sessions.map((sess) => {
            const isActive = sess.id === activeSessionId;
            const running = isRunning(sess);
            const pct = sess.jobStatus?.progress ?? 0;
            const phaseEmoji =
              sess.phase === "result" ? "✅"
              : sess.phase === "generating" ? "🎬"
              : sess.phase === "review" ? "✏️"
              : "⚙️";

            return (
              <div key={sess.id} className="flex items-center">
                <button
                  onClick={() => setActiveSessionId(sess.id)}
                  className="flex items-center gap-2 rounded-l-xl px-4 py-2 text-sm font-semibold transition-all"
                  style={{
                    background: isActive ? "linear-gradient(90deg, #1a7a3c, #25a85a)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                    borderTop: isActive ? "1px solid rgba(37,168,90,0.6)" : "1px solid rgba(255,255,255,0.08)",
                    borderBottom: isActive ? "1px solid rgba(37,168,90,0.6)" : "1px solid rgba(255,255,255,0.08)",
                    borderLeft: isActive ? "1px solid rgba(37,168,90,0.6)" : "1px solid rgba(255,255,255,0.08)",
                    borderRight: "none",
                  }}
                >
                  {running ? <Spinner size={3} /> : <span className="text-xs">{phaseEmoji}</span>}
                  {sess.label}
                  {sess.phase === "generating" && pct > 0 && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(37,168,90,0.3)", color: "#7ecfa0" }}>
                      {pct}%
                    </span>
                  )}
                  {sess.phase === "generating" && pct === 0 && <span className="text-xs opacity-60">Starting…</span>}
                  {sess.loading && <span className="text-xs opacity-60">Thinking…</span>}
                </button>

                {sessions.length > 1 && (
                  <button
                    onClick={() => removeWorker(sess.id)}
                    className="rounded-r-xl px-2 py-2 text-xs text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
                    style={{
                      background: isActive ? "rgba(37,168,90,0.25)" : "rgba(255,255,255,0.04)",
                      borderTop: isActive ? "1px solid rgba(37,168,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      borderRight: isActive ? "1px solid rgba(37,168,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      borderBottom: isActive ? "1px solid rgba(37,168,90,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      borderLeft: "1px solid rgba(255,255,255,0.10)",
                    }}
                    title="Remove worker"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={addWorker}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#25a85a]/40 px-4 py-2 text-sm text-[#7ecfa0] transition hover:border-[#25a85a]/70 hover:bg-[#25a85a]/10"
          >
            <span className="text-base leading-none">+</span>New Worker
          </button>

          <span className="ml-auto text-xs text-white/30">
            {sessions.filter(isRunning).length > 0
              ? `${sessions.filter(isRunning).length} worker(s) running`
              : "All workers idle"}
          </span>
        </div>

        {/* Error Banner */}
        <AnimatePresence>
          {s.error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-red-300"
            >
              ⚠️ {s.error}
              <button onClick={() => updateSession(s.id, { error: null })} className="ml-3 text-red-400 hover:text-red-200">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase Router */}
        <AnimatePresence mode="wait">

          {s.phase === "input" && (
            <motion.div key={`input-${s.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
              <div className="grid gap-8 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <ConfigPanel
                    script={s.script} setScript={(v) => updateSession(s.id, { script: typeof v === "function" ? v(s.script) : v })}
                    extraPrompt={s.extraPrompt} setExtraPrompt={(v) => updateSession(s.id, { extraPrompt: typeof v === "function" ? v(s.extraPrompt) : v })}
                    numClips={s.numClips} setNumClips={(v) => updateSession(s.id, { numClips: typeof v === "function" ? v(s.numClips) : v })}
                    durationLabel={s.durationLabel} setDurationLabel={(v) => updateSession(s.id, { durationLabel: typeof v === "function" ? v(s.durationLabel) : v })}
                    aspectRatio={s.aspectRatio} setAspectRatio={(v) => updateSession(s.id, { aspectRatio: typeof v === "function" ? v(s.aspectRatio) : v })}
                    veoModel={s.veoModel} setVeoModel={(v) => updateSession(s.id, { veoModel: typeof v === "function" ? v(s.veoModel) : v })}
                    languageNote={s.languageNote} setLanguageNote={(v) => updateSession(s.id, { languageNote: typeof v === "function" ? v(s.languageNote) : v })}
                  />
                </div>
                <div className="lg:col-span-2">
                  <CharacterUpload
                    usePhotos={s.usePhotos} setUsePhotos={(v) => updateSession(s.id, { usePhotos: typeof v === "function" ? v(s.usePhotos) : v })}
                    characters={s.characters} setCharacters={(v) => updateSession(s.id, { characters: typeof v === "function" ? v(s.characters) : v })}
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => handleGeneratePrompts(s.id)}
                  disabled={s.loading}
                  className="rounded-xl px-10 py-3.5 text-lg font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(90deg, #1a7a3c, #25a85a)" }}
                >
                  {s.loading ? <span className="flex items-center gap-2"><Spinner size={5} />Generating Prompts…</span> : "🎬  Generate Prompts"}
                </button>
              </div>
            </motion.div>
          )}

          {s.phase === "review" && (
            <motion.div key={`review-${s.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
              <PromptEditor
                clips={s.clips} setClips={(v) => updateSession(s.id, { clips: typeof v === "function" ? v(s.clips) : v })}
                characterSheet={s.characterSheet} setCharacterSheet={(v) => updateSession(s.id, { characterSheet: typeof v === "function" ? v(s.characterSheet) : v })}
                onConfirm={() => handleGenerateVideo(s.id)}
                onBack={() => updateSession(s.id, { phase: "input" })}
                loading={s.loading}
              />
            </motion.div>
          )}

          {s.phase === "generating" && (
            <motion.div key={`generating-${s.id}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <GeneratingPanel session={s} onCancel={() => handleCancelGeneration(s.id)} />
            </motion.div>
          )}

          {s.phase === "result" && (
            <motion.div key={`result-${s.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
              <VideoResult
                videoUrl={s.videoUrl}
                clips={s.clips} setClips={(v) => updateSession(s.id, { clips: typeof v === "function" ? v(s.clips) : v })}
                numClips={s.numClips}
                onRegenerate={(indices) => handleRegenerate(s.id, indices)}
                onReset={() => handleReset(s.id)}
                loading={false}
              />
            </motion.div>
          )}

        </AnimatePresence>

        <p className="mt-12 pb-8 text-center text-xs text-[#555]">
          SuperLiving Internal Tool · AI-Powered Ad Generator · 8s max per clip
        </p>
      </div>
    </main>
  );
}