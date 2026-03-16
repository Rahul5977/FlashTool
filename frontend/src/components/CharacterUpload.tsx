"use client";

import { Dispatch, SetStateAction, useCallback, useRef } from "react";
import { motion } from "framer-motion";

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface CharacterSlot {
  name: string;
  file: File | null;
}

interface Props {
  usePhotos: boolean;
  setUsePhotos: Dispatch<SetStateAction<boolean>>;
  characters: CharacterSlot[];
  setCharacters: Dispatch<SetStateAction<CharacterSlot[]>>;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function CharacterUpload({
  usePhotos,
  setUsePhotos,
  characters,
  setCharacters,
}: Props) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateCharacter = useCallback(
    (index: number, field: keyof CharacterSlot, value: string | File | null) => {
      setCharacters((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], [field]: value };
        return copy;
      });
    },
    [setCharacters]
  );

  const addSlot = () => {
    setCharacters((prev) => [...prev, { name: "", file: null }]);
  };

  const removeSlot = (index: number) => {
    setCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      updateCharacter(index, "file", file);
    }
  };

  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderColor: "rgba(37,168,90,0.18)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <label className="text-sm font-semibold text-[#7ecfa0]">
          📸 Character Photos
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={usePhotos}
            onChange={(e) => setUsePhotos(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 accent-[#25a85a]"
          />
          <span className="text-xs text-white/60">Enable</span>
        </label>
      </div>

      {!usePhotos ? (
        <p className="text-xs text-white/40">
          Enable to upload character reference photos for face-locked I2V
          generation. Without photos, a text-only character sheet is generated.
        </p>
      ) : (
        <div className="space-y-4">
          {characters.map((char, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="text"
                  value={char.name}
                  onChange={(e) => updateCharacter(i, "name", e.target.value)}
                  placeholder={`Character ${i + 1} name`}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#25a85a]/60"
                />
                {characters.length > 1 && (
                  <button
                    onClick={() => removeSlot(i)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(i, e)}
                onClick={() => fileRefs.current[i]?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 p-6 text-center transition hover:border-[#25a85a]/40 hover:bg-white/5"
              >
                <input
                  ref={(el) => { fileRefs.current[i] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    updateCharacter(i, "file", file);
                  }}
                />
                {char.file ? (
                  <div className="text-sm">
                    <span className="text-[#25a85a]">✓</span>{" "}
                    <span className="text-white/70">{char.file.name}</span>
                    <span className="ml-2 text-xs text-white/40">
                      ({(char.file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="mb-1 text-2xl text-white/30">📁</span>
                    <p className="text-xs text-white/40">
                      Drop image or click to upload
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          ))}

          <button
            onClick={addSlot}
            className="w-full rounded-lg border border-dashed border-white/20 py-2 text-xs text-[#7ecfa0] transition hover:border-[#25a85a]/50 hover:bg-white/5"
          >
            + Add Character
          </button>

          <p className="text-xs text-white/40">
            🔒 <strong>Continuity:</strong> Clip 1 uses the photo as I2V frame 0.
            Clips 2+ use the last frame of the previous clip for seamless match-cuts.
          </p>
        </div>
      )}
    </div>
  );
}
