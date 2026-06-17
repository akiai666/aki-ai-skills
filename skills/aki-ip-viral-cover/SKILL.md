---
name: aki-ip-viral-cover
description: Generate three high-impact Aki IP social-media cover variants from a title, using Aki's fixed face reference and the black-green 3D tech cover style. Use this whenever the user asks for Aki IP爆款封面、黑绿科技封面、3D大字封面、标题生成封面、个人IP封面变体, especially when they only provide a title and want stable visual consistency.
---

# Aki IP Viral Cover

## Purpose

Generate a stable Aki IP cover series from a title. This skill is intentionally narrow: it produces three native 3:4 cover variants in the same black-green tech identity, with different impact compositions for selection.

Use this skill when the user wants this specific cover system:

- Aki's consistent face, glasses, forward fringe hairstyle, and red jacket.
- White cutout stroke around the person.
- Dark futuristic black-green background.
- Huge physical 3D block title, mostly bright white with optional neon green emphasis.
- Short-video / Xiaohongshu cover impact, not a generic cyberpunk poster.

Do not use this skill for general Aki covers, multi-platform batches, article-to-cover workflows, or case-study screenshots. Use `aki-ip-cover` for those broader workflows.

## Required References

This public template does not include Aki's real identity image or cover style image. Provide your own local references when running the script.

Identity reference options:

- CLI: `--person-reference /path/to/person-reference.png`
- Environment variable: `AKI_IP_PERSON_REFERENCE=/path/to/person-reference.png`

Style reference options:

- CLI: `--style-reference /path/to/style-reference.png`
- Environment variable: `AKI_IP_STYLE_REFERENCE=/path/to/style-reference.png`

Reference roles are strict:

- The identity reference controls only Aki's face, hairstyle, glasses, red jacket, and white cutout edge.
- The style reference controls only the visual language: black-green tech environment, glossy 3D title, depth, lighting, and feed-cover composition.
- Do not inherit old title copy, old topic, old UI labels, old pose, or any accidental background detail from the style reference.

## Default Workflow

Run the bundled script with a title. If the user does not provide an output directory, choose a timestamped folder under the current topic folder when obvious; otherwise use:

`./outputs/`

Command:

```bash
python3 skills/aki-ip-viral-cover/scripts/generate_viral_cover.py \
  --title "你的标题" \
  --person-reference "/path/to/person-reference.png" \
  --style-reference "/path/to/style-reference.png" \
  --out-dir "./outputs"
```

Default generation:

- Provider: Cygces OpenAI-compatible image API.
- Model: `gpt-image-2`.
- Endpoint: `/images/edits`.
- Size: `1024x1536`.
- Variants: 3.
- Credentials: read from `CYGCES_HERMES_API_KEY` or `CYGCES_API_KEY`, optionally loaded through `--env-file`.

Never paste, log, save, or commit API key values.

## Three Variant Recipes

The three variants must stay in one recognizable cover system. They differ by composition only:

1. `v1-foreground-impact`
   - Wide-angle foreground impact.
   - Hand, fingertip, small cube, or tool module pushes toward the lens.
   - Center burst around the foreground object.
   - Keep face readable and not distorted.

2. `v2-title-pressure`
   - Biggest title pressure.
   - Title tilts, touches edges, and feels physically close to the viewer.
   - Aki supports the title from the side or lower-right.
   - Keep the layout simple; do not bury the title in panels.

3. `v3-energy-ring`
   - Ring-shaped neon energy field and rotating light trails.
   - Strong foreground, midground, background depth.
   - Controlled fisheye feeling at the edges only.
   - Avoid turning the result into a generic sci-fi game poster.

## Title Rules

- Preserve user-provided wording exactly.
- If the user provides line breaks, preserve them.
- If the title is one sentence, split into 2-4 lines without breaking semantic phrases.
- Keep cover text minimal: main title only by default.
- No extra slogan, watermark, QR code, logo, fake platform labels, or unrelated English words.
- Use large glossy extruded 3D typography:
  - Main front faces: bright white or warm white.
  - One key phrase or line may use solid neon green.
  - 3D depth comes from dark side planes, subtle green side faces, cast shadows, and perspective.
  - Do not use rainbow gradients, colored outlines around white text, dirty stone texture, cement texture, or aged metal.

## Failure Rules

If the API fails, references are missing, or no image is returned:

- Stop and report the blocker.
- Do not switch providers silently.
- Do not use local PIL/canvas composition as a fallback.
- Do not generate placeholder images.

## Outputs

The script saves:

- `封面-3x4-{title-slug}-v1-foreground-impact.png`
- `封面-3x4-{title-slug}-v2-title-pressure.png`
- `封面-3x4-{title-slug}-v3-energy-ring.png`
- `prompts/*.md`
- `metadata.json`

After generation, verify dimensions with `sips` and inspect the images for:

- 1024 x 1536 size.
- Consistent Aki identity.
- Red jacket, glasses, white cutout stroke.
- Black-green tech cover style.
- Large readable 3D title.
- Three distinct compositions in the same visual family.
