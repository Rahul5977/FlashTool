"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { motion } from "framer-motion";
import type { ClipPrompt } from "@/app/page";

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface Props {
  videoUrl: string;
  clips: ClipPrompt[];
  setClips: Dispatch<SetStateAction<ClipPrompt[]>>;
  clipPaths: string[];
  numClips: number;
  onRegenerate: (indices: number[]) => Promise<void>;
  onReset: () => void;
  loading: boolean;
  apiBase: string;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function VideoResult({
  videoUrl,
  clips,
  setClips,
  numClips,
  onRegenerate,
  onReset,
  loading,
}: Props) {
  const [regenChecks, setRegenChecks] = useState<boolean[]>(
    new Array(clips.length).fill(false)
  );

  const toggleCheck = (i: number) => {
    setRegenChecks((prev) => {
      const copy = [...prev];
      copy[i] = !copy[i];
      return copy;
    });
  };

  const selectedIndices = regenChecks
    .map((checked, i) => (checked ? i : -1))
    .filter((i) => i >= 0);

  const updateClipPrompt = (index: number, value: string) => {
    setClips((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], prompt: value };
      return copy;
    });
  };

  return (
    <div className="space-y-8">
      {/* ── Final Video ──────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-white">
          🎉 Your SuperLiving Ad is Ready!
        </h2>

        <div
          className="overflow-hidden rounded-2xl border"
          style={{
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(37,168,90,0.18)",
          }}
        >
          <div className="grid gap-6 p-6 lg:grid-cols-4">
            <div className="lg:col-span-3">
              <video
                src={videoUrl}
                controls
                className="w-full rounded-xl"
                style={{ maxHeight: 480 }}
              />
            </div>
            <div className="flex flex-col justify-center gap-4">
              <a
                href={videoUrl}
                download="superliving_ad.mp4"
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{
                  background: "linear-gradient(90deg, #1a7a3c, #25a85a)",
                }}
              >
                ⬇️ Download Video (MP4)
              </a>
              <p className="text-center text-xs text-white/40">
                Duration: ~{numClips * 8}s · Clips: {numClips}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Individual Clips ─────────────────────────────────────────── */}
      {clips.length > 1 && (
        <div>
          <h3 className="mb-2 text-lg font-bold text-white">
            🎞️ Individual Clips — Preview, Edit &amp; Regenerate
          </h3>
          <p className="mb-4 text-xs text-white/50">
            💡 <strong>Selective regeneration:</strong> Check the clips you want
            to redo, optionally edit their prompts, then click{" "}
            <strong>Regenerate Selected</strong>. Unchanged clips are kept as-is.
          </p>

          <div className="space-y-4">
            {clips.map((clip, i) => (
              <motion.div
                key={clip.clip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border p-5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderColor: regenChecks[i]
                    ? "rgba(37,168,90,0.5)"
                    : "rgba(37,168,90,0.18)",
                }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25a85a]/20 text-xs font-bold text-[#25a85a]">
                    {clip.clip}
                  </span>
                  <span className="flex-1 text-sm text-white/70">
                    {clip.scene_summary}
                  </span>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={regenChecks[i] || false}
                      onChange={() => toggleCheck(i)}
                      className="h-4 w-4 rounded border-white/20 accent-[#25a85a]"
                    />
                    <span className="text-xs text-white/50">
                      🔄 Regenerate
                    </span>
                  </label>
                </div>

                {/* Editable prompt — visible for all clips */}
                <textarea
                  value={clip.prompt}
                  onChange={(e) => updateClipPrompt(i, e.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs leading-relaxed text-white/70 outline-none focus:border-[#25a85a]/60 focus:ring-1 focus:ring-[#25a85a]/40"
                />
              </motion.div>
            ))}
          </div>

          {/* ── Regenerate / Reset Buttons ────────────────────────────── */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            {selectedIndices.length > 0 ? (
              <button
                onClick={() => onRegenerate(selectedIndices)}
                disabled={loading}
                className="rounded-xl px-8 py-3 text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(90deg, #1a7a3c, #25a85a)",
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    Regenerating…
                  </span>
                ) : (
                  `🔄  Regenerate Clip(s) ${selectedIndices.map((i) => i + 1).join(", ")}`
                )}
              </button>
            ) : (
              <button
                disabled
                className="cursor-not-allowed rounded-xl bg-white/10 px-8 py-3 text-sm text-white/30"
              >
                🔄 Regenerate Selected (select clips above)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Make Another Ad ──────────────────────────────────────────── */}
      <div className="flex justify-center">
        <button
          onClick={onReset}
          className="rounded-lg border border-white/15 px-6 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
        >
          🔄 Make Another Ad
        </button>
      </div>
    </div>
  );
}
