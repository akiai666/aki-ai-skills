# Computer Requirements

## Basic Use

Suitable for videos that already provide subtitles:

- Python 3.9 or newer
- 8 GB RAM
- 5-10 GB free temporary disk space
- `ffmpeg`, `ffprobe`, and `yt-dlp`

The work is mostly downloading, reading text, extracting a few frames, and
building HTML. A dedicated GPU is not required.

## Videos Without Subtitles

Local speech recognition is the expensive step.

- 16 GB RAM is a comfortable baseline.
- Apple silicon can run local ASR on CPU, but long videos take time.
- An NVIDIA GPU with 6 GB or more VRAM is useful for frequent long-video work.
- Disk usage grows with model cache and source video size.

The provided fallback creates a virtual environment inside the disposable work
directory. This avoids installing Python packages into the global environment.

## Deployment Models

- Personal use: run everything on one computer and save the final HTML locally.
- Shared team use: run preparation and ASR on a worker machine, then return only
  the HTML.
- Public product: wrap the same contract in a queue and object storage, while
  keeping the generated HTML as the primary artifact.

Do not expose credentials, browser cookies, or private network addresses in a
public skill configuration.
