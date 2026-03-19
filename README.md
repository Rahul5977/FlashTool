# 🎬 SuperLiving — AI-Powered Video Ad Generator

Generate **seamless, multi-clip AI videos** from a single script using **Google Veo 3.1**, **Gemini 2.5**, and **strict Image-to-Video chains** that eliminate character drift and hallucinations.

## 📋 Features

✅ **Agentic Pipeline** — Automatically parse script → generate character references → split into clip prompts  
✅ **Strict I2V Chain** — Last-frame continuity + prompt bridging prevents visual hallucinations  
✅ **Prompt Sanitization** — Automatic NSFW/health content filtering to pass Veo's safety policy  
✅ **Character Consistency** — Locked appearance + outfit across all clips  
✅ **Cinematic Stitching** — FFmpeg crossfades with zero A/V desync  
✅ **CTA Append** — Auto-concat a CTA video to the final output  
✅ **Regenerate on Demand** — Re-render specific clips without full pipeline

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.9+** (macOS, Linux, or Windows)
- **FFmpeg** (for video stitching)
- **Google Cloud API Key** with Generative AI enabled
- **pip** (dependency management)

### 1. Install FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install ffmpeg
```

**Windows:**

Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use Chocolatey:

```bash
choco install ffmpeg
```

### 2. Clone & Setup

```bash
cd ~/......
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Create/update `.env` in the root directory:

```env
GOOGLE_API_KEY=your-api-key-here
```

**Get your API key:**

1. Go to Google Cloud Console at console.cloud.google.com/apis/credentials
2. Click **Create Credentials** → **API Key**
3. Enable **Generative AI API** for your project
4. Copy the key and paste into `.env`

### 5. Organize Assets

Create the CTA video directory:

```bash
mkdir -p backend/assets
# Place your CTA video here as: assets/cta.mp4
```

## Setting Up S3 for Deployment (Optional)

For deploying the backend on AWS, set up an S3 bucket:

1. Create an S3 bucket in the AWS console
2. Configure bucket policy to allow public read access (for video files)
3. Note the bucket name and region

Update `.env` with S3 details:

```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=your-region
```

---

### 6. Run the Backend

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

---

## 📚 API Endpoints

### Health Check

```http
GET /api/health
```

Returns: `{"status": "ok"}`

### Phase 1-3: Agentic Pipeline

```http
POST /api/agentic-pipeline
```

**Input:**

```json
{
  "script": "Your ad script here...",
  "num_clips": 4
}
```

**Output:** Characters + auto-generated clip prompts ready for review

### Analyze Characters (from photos)

```http
POST /api/analyze-characters
```

**Input:** Upload character photos + names  
**Output:** Locked appearance + outfit descriptions

### Generate Prompts (manual)

```http
POST /api/generate-prompts
```

**Input:** Script + character data + settings  
**Output:** Array of clip prompts for human review

### Generate Video (main endpoint)

```http
POST /api/generate-video
```

**Input:** User-reviewed clip prompts + character references  
**Output:** Final MP4 URL (AI clips + CTA stitched)

### Regenerate Specific Clips

```http
POST /api/regenerate-clips
```

**Input:** Clip indices to re-render  
**Output:** Updated final video

### Download Video

```http
GET /api/video/{filename}
```
