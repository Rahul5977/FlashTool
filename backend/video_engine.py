"""
Video Engine — FFmpeg functions extracted from sl_ad_gen_rahul.py.

🚨 CRITICAL: The stitch_clips logic, offsets, FFmpeg commands, and all
math in this file are EXACT copies from the original monolith.
DO NOT alter, "optimize", or rewrite them.
"""

import logging
import os
import re as _re
import shutil
import subprocess
import tempfile

try:
    import imageio_ffmpeg
except ImportError:
    imageio_ffmpeg = None

logger = logging.getLogger(__name__)

# ── Portable temp dir ─────────────────────────────────────────────────────────
TMP = tempfile.gettempdir()


def _get_ffmpeg() -> str:
    """Return path to ffmpeg binary or raise."""
    import shutil
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        try:
            import imageio_ffmpeg
            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
    if ffmpeg_bin is None:
        raise RuntimeError("ffmpeg not found.")
    return ffmpeg_bin


def extract_last_n_frames(video_path: str, n: int = 10) -> list:
    """
    Extract the last N frames of an MP4 as a list of JPEG bytes.
    Samples evenly across the last 2 seconds of the clip.
    Returns list of bytes objects, ordered earliest → latest.
    """
    ffmpeg_bin = _get_ffmpeg()
    frames = []
    # Sample n frames evenly across the last 2s
    for k in range(n):
        # offset from end: from -2.0s to -0.1s in n steps
        t_from_end = 2.0 - (k / max(n - 1, 1)) * 1.9   # 2.0 → 0.1
        out_path = video_path.replace(".mp4", f"_frame_{k:02d}.jpg")
        r = subprocess.run(
            [ffmpeg_bin, "-y", "-sseof", f"-{t_from_end:.3f}",
             "-i", video_path, "-vframes", "1", "-q:v", "2", out_path],
            capture_output=True, text=True,
        )
        if r.returncode == 0 and os.path.exists(out_path):
            with open(out_path, "rb") as f:
                frames.append(f.read())
    if not frames:
        raise RuntimeError(f"Could not extract any frames from {video_path}")
    return frames


def extract_last_frame(video_path: str) -> bytes:
    """
    Extract the absolute last frame of an MP4 as JPEG bytes.

    WHY A SINGLE LAST FRAME (not a collage):
    Veo's I2V treats the input image as literal frame 0 of the new clip.
    A multi-frame collage causes grid-like artifacts and hallucinations because
    the diffusion model tries to "continue" from a composite image that never
    existed as a real video frame. Using the exact last frame gives Veo a
    pixel-perfect match-cut starting point — the new clip begins exactly where
    the previous clip ended, creating the illusion of a single unbroken take.
    """
    ffmpeg_bin = _get_ffmpeg()
    out_path = video_path.replace(".mp4", "_last_frame.jpg")
    # -sseof -0.04 seeks to ~1 frame before EOF (at 24fps ≈ 0.042s)
    r = subprocess.run(
        [ffmpeg_bin, "-y", "-sseof", "-0.04",
         "-i", video_path, "-vframes", "1", "-q:v", "2", out_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(out_path):
        # Fallback: try seeking to -0.1s from end
        r = subprocess.run(
            [ffmpeg_bin, "-y", "-sseof", "-0.1",
             "-i", video_path, "-vframes", "1", "-q:v", "2", out_path],
            capture_output=True, text=True,
        )
    if r.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError(f"Could not extract last frame from {video_path}")
    with open(out_path, "rb") as f:
        return f.read()


def stitch_clips(clip_paths: list, output_path: str) -> bool:
    """
    Stitch AI-generated clips into one seamless video with zero audio pops,
    zero A/V desync, and zero timestamp drift.

    ─── THE PROBLEM ───
    Veo-generated clips have audio streams that are a fraction of a second
    longer or shorter than the video stream. When naïvely concatenated:
      - Audio pops/clicks at every cut boundary (partial AAC frames)
      - Cumulative A/V drift (each clip adds ±50ms of misalignment)
      - Lip-sync breaks down after 2-3 clips

    ─── THE FIX: 3-STAGE NORMALIZATION ───

    Stage 1 — Video: force exact 24fps, yuv420p, even resolution, H.264.
              This gives every clip identical GOP structure and timebase.

    Stage 2 — Audio sync (THE CRITICAL PART):
      • aresample=async=1  →  stretches/squeezes audio timestamps to match
                               the video clock. Eliminates sub-frame drift.
      • apad                →  pads silence at the end if audio is shorter
                               than video (prevents abrupt cutoff).
      • -shortest           →  truncates the padded audio exactly when the
                               video stream ends (clean cut, no overhang).
      Together these three guarantee: audio duration == video duration,
      sample-accurately, for every single clip.

      For clips WITHOUT audio: generate anullsrc silence trimmed to the
      exact video duration (parsed from ffmpeg -i stderr, no ffprobe).

    Stage 3 — Concat demuxer with -c copy. Because every clip now has
              identical codec params AND identical A/V durations, stream-copy
              concat is frame-perfect with zero re-encoding artifacts.

    NO FFPROBE DEPENDENCY — duration parsed from `ffmpeg -i` stderr via regex.
    """

    # ── Locate ffmpeg binary ──────────────────────────────────────────────────
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        try:
            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
    if not ffmpeg_bin:
        logger.error("❌ ffmpeg not found — cannot stitch clips.")
        return False

    # ── Helper: parse duration from ffmpeg -i stderr (no ffprobe) ─────────────
    def probe_duration(path: str) -> float:
        r = subprocess.run(
            [ffmpeg_bin, "-i", path],
            capture_output=True, text=True,
        )
        m = _re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        logger.warning(f"⚠️ Could not parse duration for {os.path.basename(path)} — assuming 7.7s")
        return 7.7

    # ── Helper: check if clip contains an audio stream ────────────────────────
    def has_audio_stream(path: str) -> bool:
        r = subprocess.run(
            [ffmpeg_bin, "-i", path],
            capture_output=True, text=True,
        )
        return "Audio:" in r.stderr

    try:
        # ══════════════════════════════════════════════════════════════════════
        # STAGE 1+2: Normalize every clip — video + audio sync
        #
        # Goal: every output file has EXACTLY matching video and audio
        # durations, identical codecs, and clean stream boundaries.
        # ══════════════════════════════════════════════════════════════════════
        normalized = []

        for i, p in enumerate(clip_paths):
            norm_path = os.path.join(TMP, f"norm_{i:02d}.mp4")
            clip_has_audio = has_audio_stream(p)

            if clip_has_audio:
                # ── HAS AUDIO: aresample→apad→-shortest pipeline ─────────
                #
                # aresample=async=1:
                #   Resamples audio so its timestamps exactly match the video
                #   clock. If audio is 7.68s but video is 7.70s, async=1
                #   stretches/inserts silence samples to fill the gap.
                #   This kills sub-frame drift that causes cumulative desync.
                #
                # apad:
                #   Pads the audio with silence PAST the video end — this
                #   guarantees audio is never shorter than video (which would
                #   cause a pop/click at the cut boundary).
                #
                # -shortest:
                #   Terminates the output when the SHORTEST stream (video)
                #   ends. Since apad made audio infinite, -shortest cleanly
                #   cuts it at exactly the video duration. No overhang.
                #
                # Net result: audio_duration == video_duration, sample-perfect.
                logger.info(f"  📎 Clip {i+1}: normalizing video + audio (aresample→apad→shortest)...")
                r = subprocess.run(
                    [ffmpeg_bin, "-y", "-i", p,
                     # ── Video filters ──
                     "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24,format=yuv420p",
                     "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                     "-pix_fmt", "yuv420p",
                     # ── Audio filters (the critical sync chain) ──
                     "-af", "aresample=async=1,apad",
                     "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
                     # ── Trim audio to exact video length ──
                     "-shortest",
                     norm_path],
                    capture_output=True, text=True,
                )
                if r.returncode != 0:
                    logger.warning(f"  ⚠️ Clip {i+1}: aresample pipeline failed, trying basic normalize...")
                    logger.debug(f"  🔧 Clip {i+1} aresample error: {r.stderr[-800:]}")
                    # Fallback: basic normalize without aresample (still better than raw)
                    r = subprocess.run(
                        [ffmpeg_bin, "-y", "-i", p,
                         "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24,format=yuv420p",
                         "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                         "-pix_fmt", "yuv420p",
                         "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
                         "-shortest",
                         norm_path],
                        capture_output=True, text=True,
                    )
                    if r.returncode != 0:
                        raise RuntimeError(
                            f"Normalize clip {i+1} failed (both pipelines):\n{r.stderr[-500:]}"
                        )

            else:
                # ── NO AUDIO: generate silence trimmed to exact video duration ─
                #
                # We probe the video-only duration first, then generate a
                # silent audio track of exactly that length with -t.
                # This is more precise than -shortest with anullsrc (which
                # can leave a trailing partial AAC frame).
                vid_dur = probe_duration(p)
                logger.info(f"  🔇 Clip {i+1}: no audio — generating {vid_dur:.3f}s silence track...")
                r = subprocess.run(
                    [ffmpeg_bin, "-y",
                     "-i", p,
                     "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={vid_dur:.4f}",
                     # ── Video ──
                     "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=24,format=yuv420p",
                     "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                     "-pix_fmt", "yuv420p",
                     # ── Map video from input 0, audio from input 1 ──
                     "-map", "0:v:0", "-map", "1:a:0",
                     "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
                     # ── Hard trim to video duration (belt + suspenders) ──
                     "-t", f"{vid_dur:.4f}",
                     norm_path],
                    capture_output=True, text=True,
                )
                if r.returncode != 0:
                    raise RuntimeError(
                        f"Normalize+silence clip {i+1} failed:\n{r.stderr[-500:]}"
                    )

            # Log the result
            dur = probe_duration(norm_path)
            normalized.append(norm_path)
            sz = os.path.getsize(norm_path) // 1024
            logger.info(f"  ✅ Clip {i+1}: {dur:.2f}s normalized ({sz} KB)")

        # ── Single clip — just copy, no concat needed ─────────────────────────
        if len(normalized) == 1:
            shutil.copy(normalized[0], output_path)
            logger.info("  ✅ Single clip — no stitching needed")
            return True

        # ══════════════════════════════════════════════════════════════════════
        # STAGE 3: Concat demuxer — stream-copy (primary), re-encode (fallback)
        #
        # All clips now have:
        #   ✓ Identical video codec (H.264 main, yuv420p, 24fps)
        #   ✓ Identical audio codec (AAC, 44100Hz, stereo, 128kbps)
        #   ✓ audio_duration == video_duration (sample-perfect)
        #
        # Stream-copy concat should be seamless. Re-encode fallback exists
        # only for edge cases (profile/level mismatches across clips).
        # ══════════════════════════════════════════════════════════════════════

        # Write concat list with absolute paths (cross-platform safe)
        list_file = os.path.join(TMP, "veo_concat_list.txt")
        with open(list_file, "w") as f:
            for p in normalized:
                safe_path = os.path.abspath(p).replace("\\", "/")
                f.write(f"file '{safe_path}'\n")

        # ── 3a: Stream-copy concat (fast, zero quality loss) ──────────────────
        r_copy = subprocess.run(
            [ffmpeg_bin, "-y", "-f", "concat", "-safe", "0",
             "-i", list_file,
             "-c", "copy",
             "-movflags", "+faststart",
             output_path],
            capture_output=True, text=True,
        )

        if (r_copy.returncode == 0
                and os.path.exists(output_path)
                and os.path.getsize(output_path) > 100_000):
            sz = os.path.getsize(output_path) // (1024 * 1024)
            final_dur = probe_duration(output_path)
            logger.info(
                f"  ✅ Final video: {sz} MB, {final_dur:.2f}s "
                f"(stream-copy concat, A/V sync locked)"
            )
            return True

        # ── 3b: Re-encode concat (fallback) ──────────────────────────────────
        logger.warning("⚠️ Stream-copy concat failed — falling back to re-encode concat.")
        logger.debug(f"🔧 Stream-copy error: {r_copy.stderr[-2000:]}")

        r_reencode = subprocess.run(
            [ffmpeg_bin, "-y", "-f", "concat", "-safe", "0",
             "-i", list_file,
             "-vf", "fps=24,format=yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "18",
             "-pix_fmt", "yuv420p",
             "-af", "aresample=async=1",
             "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
             "-movflags", "+faststart",
             output_path],
            capture_output=True, text=True,
        )

        if (r_reencode.returncode == 0
                and os.path.exists(output_path)
                and os.path.getsize(output_path) > 100_000):
            sz = os.path.getsize(output_path) // (1024 * 1024)
            final_dur = probe_duration(output_path)
            logger.info(
                f"  ✅ Final video: {sz} MB, {final_dur:.2f}s "
                f"(re-encode concat fallback, A/V sync locked)"
            )
            return True

        logger.error(
            f"❌ All stitching methods failed.\n"
            f"Stream-copy stderr:\n{r_copy.stderr[-400:]}\n\n"
            f"Re-encode stderr:\n{r_reencode.stderr[-400:]}"
        )
        return False

    except Exception as e:
        logger.error(f"❌ Stitch error: {e}", exc_info=True)
        return False
