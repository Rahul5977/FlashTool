"use client";

import { useState, useCallback } from "react";
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

type Phase = "input" | "review" | "result";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ─── Page Component ────────────────────────────────────────────────────── */

export default function Home() {
  // ── Phase state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Config state (Phase 1) ─────────────────────────────────────────────
  const [script, setScript] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [numClips, setNumClips] = useState(6);
  const [durationLabel, setDurationLabel] = useState("45s");
  const [aspectRatio, setAspectRatio] = useState("9:16 (Reels / Shorts)");
  const [veoModel, setVeoModel] = useState("veo-3.1-generate-preview");
  const [languageNote, setLanguageNote] = useState(true);

  // ── Character state ────────────────────────────────────────────────────
  const [usePhotos, setUsePhotos] = useState(false);
  const [characters, setCharacters] = useState<
    { name: string; file: File | null }[]
  >([
    { name: "", file: null },
    { name: "", file: null },
  ]);
  const [, setPhotoAnalyses] = useState<
    Record<string, CharacterAnalysis>
  >({});

  // Note: photoAnalyses state is set during analysis and passed to generate-prompts.
  // The setter is used in handleGeneratePrompts; the getter is not needed at render time.

  // ── Prompts state (Phase 2) ────────────────────────────────────────────
  const [clips, setClips] = useState<ClipPrompt[]>([]);
  const [characterSheet, setCharacterSheet] = useState("");

  // ── Result state (Phase 3) ─────────────────────────────────────────────
  const [videoUrl, setVideoUrl] = useState("");
  const [clipPaths, setClipPaths] = useState<string[]>([]);

  /* ─── Phase 1 → Phase 2: Generate Prompts ──────────────────────────── */

  const handleGeneratePrompts = useCallback(async () => {
    if (!script.trim()) {
      setError("Please paste your ad script before generating.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // Step 1: Analyze character photos if any
      let analyses: Record<string, CharacterAnalysis> = {};
      if (usePhotos) {
        const validChars = characters.filter(
          (c) => c.name.trim() && c.file
        );
        if (validChars.length > 0) {
          const formData = new FormData();
          for (const c of validChars) {
            formData.append("names", c.name.trim());
            formData.append("photos", c.file!);
          }
          const resp = await fetch(`${API_BASE}/api/analyze-characters`, {
            method: "POST",
            body: formData,
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Character analysis failed");
          }
          const data = await resp.json();
          analyses = data.analyses;
          setPhotoAnalyses(analyses);
        }
      }

      // Step 2: Generate prompts
      const resp = await fetch(`${API_BASE}/api/generate-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          extra_prompt: extraPrompt,
          photo_analyses: analyses,
          aspect_ratio: aspectRatio,
          num_clips: numClips,
          language_note: languageNote,
          has_photos: usePhotos && Object.keys(analyses).length > 0,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Prompt generation failed");
      }

      const data = await resp.json();
      setClips(data.clips);
      setCharacterSheet(data.character_sheet || "");
      setPhase("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [
    script,
    extraPrompt,
    usePhotos,
    characters,
    aspectRatio,
    numClips,
    languageNote,
  ]);

  /* ─── Phase 2 → Phase 3: Generate Video ────────────────────────────── */

  const handleGenerateVideo = useCallback(async () => {
    setError(null);
    setLoading(true);

    const arMap: Record<string, string> = {
      "9:16 (Reels / Shorts)": "9:16",
      "16:9 (YouTube / Landscape)": "16:9",
    };

    try {
      const resp = await fetch(`${API_BASE}/api/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips,
          veo_model: veoModel,
          aspect_ratio: arMap[aspectRatio] || "9:16",
          num_clips: numClips,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Video generation failed");
      }

      const data = await resp.json();
      setVideoUrl(`${API_BASE}${data.video_url}`);
      setClipPaths(data.clip_paths);
      setPhase("result");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [clips, veoModel, aspectRatio, numClips]);

  /* ─── Phase 3: Regenerate Selected Clips ───────────────────────────── */

  const handleRegenerate = useCallback(
    async (indices: number[]) => {
      setError(null);
      setLoading(true);

      const arMap: Record<string, string> = {
        "9:16 (Reels / Shorts)": "9:16",
        "16:9 (YouTube / Landscape)": "16:9",
      };

      try {
        const resp = await fetch(`${API_BASE}/api/regenerate-clips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clip_indices: indices,
            clips,
            clip_paths: clipPaths,
            veo_model: veoModel,
            aspect_ratio: arMap[aspectRatio] || "9:16",
            num_clips: numClips,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || "Clip regeneration failed");
        }

        const data = await resp.json();
        setVideoUrl(`${API_BASE}${data.video_url}`);
        setClipPaths(data.clip_paths);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [clips, clipPaths, veoModel, aspectRatio, numClips]
  );

  /* ─── Reset ─────────────────────────────────────────────────────────── */

  const handleReset = () => {
    setPhase("input");
    setClips([]);
    setVideoUrl("");
    setClipPaths([]);
    setError(null);
    setCharacterSheet("");
    setPhotoAnalyses({});
  };

  /* ─── Render ────────────────────────────────────────────────────────── */

  return (
    <main className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div
          className="mb-8 flex items-center gap-4 rounded-2xl px-6 py-5"
          style={{
            background: "linear-gradient(90deg, #1a7a3c, #25a85a)",
            boxShadow: "0 4px 24px rgba(26,122,60,0.35)",
          }}
        >
          <span className="text-4xl">🎬</span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              SuperLiving — Ad Generator
            </h1>
            <p className="mt-0.5 text-sm text-white/80">
              Transform your scripts into high-impact video ads for Tier 3 &amp;
              4 India · Powered by AI
            </p>
          </div>
        </div>

        {/* ── Error Banner ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-red-300"
            >
              ⚠️ {error}
              <button
                onClick={() => setError(null)}
                className="ml-3 text-red-400 hover:text-red-200"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase Router ──────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {phase === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid gap-8 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <ConfigPanel
                    script={script}
                    setScript={setScript}
                    extraPrompt={extraPrompt}
                    setExtraPrompt={setExtraPrompt}
                    numClips={numClips}
                    setNumClips={setNumClips}
                    durationLabel={durationLabel}
                    setDurationLabel={setDurationLabel}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    veoModel={veoModel}
                    setVeoModel={setVeoModel}
                    languageNote={languageNote}
                    setLanguageNote={setLanguageNote}
                  />
                </div>
                <div className="lg:col-span-2">
                  <CharacterUpload
                    usePhotos={usePhotos}
                    setUsePhotos={setUsePhotos}
                    characters={characters}
                    setCharacters={setCharacters}
                  />
                </div>
              </div>

              {/* Generate Button */}
              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleGeneratePrompts}
                  disabled={loading}
                  className="rounded-xl px-10 py-3.5 text-lg font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(90deg, #1a7a3c, #25a85a)",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="h-5 w-5 animate-spin"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Generating Prompts…
                    </span>
                  ) : (
                    "🎬  Generate Prompts"
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {phase === "review" && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <PromptEditor
                clips={clips}
                setClips={setClips}
                characterSheet={characterSheet}
                setCharacterSheet={setCharacterSheet}
                onConfirm={handleGenerateVideo}
                onBack={() => setPhase("input")}
                loading={loading}
              />
            </motion.div>
          )}

          {phase === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <VideoResult
                videoUrl={videoUrl}
                clips={clips}
                setClips={setClips}
                numClips={numClips}
                onRegenerate={handleRegenerate}
                onReset={handleReset}
                loading={loading}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <p className="mt-12 pb-8 text-center text-xs text-[#555]">
          SuperLiving Internal Tool · AI-Powered Ad Generator · 8s max per clip
        </p>
      </div>
    </main>
  );
}
