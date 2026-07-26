---
name: aki-bilibili-learning-note
description: Turn a Bilibili long-video link into a self-contained, reading-first HTML learning note with a 30-second preview, timestamped highlights, illustrated long-form explanation, quotes, evidence, chapter navigation, and searchable transcript. Use when the user sends a Bilibili/B站 link and asks to summarize, learn, transcribe, make an HTML note, extract highlights, or jump back to exact video moments.
---

# Long Video Learning Note

Create a video learning navigator, not a compressed summary.

The reader should be able to:

1. judge the video's value in 30 seconds;
2. understand the full argument by reading;
3. find distinctive ideas, stories, examples, disputes, and quotes;
4. jump from every important claim to the original Bilibili timestamp;
5. keep one portable HTML file as a durable learning asset.

## Product Rules

- Output one self-contained `.html` file. Embed screenshots as data URLs.
- Reading comes first; the original video supplies tone, detail, and evidence.
- Preserve reasoning and useful context. Do not turn the article into bullet soup.
- Every core claim, quote, datum, highlight, and meaningful paragraph needs a source timestamp.
- Quotes must be close transcriptions, never invented paraphrases in quotation marks.
- Clearly distinguish verified source content from the agent's interpretation.
- Do not infer speaker identities from voice alone. Use known names only when metadata or the dialogue makes them explicit; otherwise use `主持人`, `嘉宾 A`, or omit the label.
- Keep downloaded media and working files outside the final knowledge directory. Delete them after successful validation unless the user asks to retain them.

## Fast Path

Set the skill directory and create a work directory:

```bash
SKILL_DIR="<directory containing this SKILL.md>"
WORK_DIR="./bili-learning-work"
python3 "$SKILL_DIR/scripts/bili_note.py" doctor
python3 "$SKILL_DIR/scripts/bili_note.py" prepare "<BILIBILI_URL>" --work-dir "$WORK_DIR"
```

`prepare` obtains metadata, the source video, and subtitles when available. If no transcript is produced, follow [Transcription Fallback](#transcription-fallback).

Then:

1. Read `references/content-contract.md`.
2. Read `$WORK_DIR/source.json` and `$WORK_DIR/transcript.json`.
3. Write `$WORK_DIR/note.json` matching `references/note-schema.json`.
4. Select 6-12 timestamps that genuinely improve understanding.
5. Extract screenshots near those timestamps:

```bash
python3 "$SKILL_DIR/scripts/bili_note.py" frames \
  --work-dir "$WORK_DIR" \
  --note "$WORK_DIR/note.json"
```

6. Render and validate:

```bash
python3 "$SKILL_DIR/scripts/bili_note.py" render \
  --note "$WORK_DIR/note.json" \
  --output "./视频标题-学习笔记.html"

python3 "$SKILL_DIR/scripts/bili_note.py" validate \
  "./视频标题-学习笔记.html"
```

7. Open the HTML and inspect desktop and mobile layouts when browser tools are available.
8. Move only the final HTML to the user's requested knowledge directory.
9. Remove working media:

```bash
python3 "$SKILL_DIR/scripts/bili_note.py" clean --work-dir "$WORK_DIR"
```

## Editorial Workflow

### 1. Identify The Video Type

Choose one:

- `interview`: people, viewpoints, disagreements, stories, examples, quotes
- `tutorial`: goals, steps, demonstrations, pitfalls, tools, actions
- `business`: thesis, evidence, numbers, scenarios, risks, unverified forecasts
- `talk`: argument structure, concepts, analogies, cases, implications

Do not force the wrong structure merely to fill a template.

### 2. Build The 30-Second Preview

Answer only:

- What is this video about?
- What is its most important conclusion?
- Who benefits from it?
- Which 2-5 moments deserve watching in the original?
- How long will this note take to read?

This section is a decision aid, not marketing copy.

### 3. Select Highlights

Choose 6-12 meaningful moments across the whole video. Prefer:

- a distinctive or counterintuitive idea;
- a decisive piece of evidence;
- a story or example that carries the argument;
- a real disagreement or uncertainty;
- an exact memorable quote;
- the final synthesis.

Avoid mechanical chapter starts, repeated claims, greetings, sponsor segments, and screenshots that only show talking heads without adding context.

### 4. Write The Article

Write a continuous learning article, usually 5-10 sections.

- Open each section with its point, then preserve enough reasoning to make it understandable.
- Use short Chinese paragraphs, typically 60-160 characters.
- Attribute positions when speakers disagree.
- Explain technical terms in context.
- Include screenshots where they clarify a chart, slide, object, demonstration, or change of topic.
- Add timestamp links to important paragraphs; do not attach meaningless links to every sentence.
- Keep uncertainty visible. Predictions are not facts.

### 5. Build Evidence And Quotes

- `quotes`: exact or lightly cleaned spoken wording plus speaker, context, and timestamp.
- `evidence`: data, cases, cited mechanisms, and predictions. Add a caveat when the source does not independently verify the claim.
- `disagreements`: state each side fairly and identify whether the video resolves it.

### 6. Preserve The Transcript

Keep the complete timestamped transcript in `note.json`. It is searchable and collapsed by default in the HTML.

Correct obvious ASR errors while preserving timing. Never silently replace uncertain names, numbers, or terms; flag them in `caveats`.

## Transcription Fallback

Use local transcription so the default workflow does not require an API key.

Preferred:

```bash
python3 -m venv "$WORK_DIR/.venv"
"$WORK_DIR/.venv/bin/pip" install faster-whisper
"$WORK_DIR/.venv/bin/python" "$SKILL_DIR/scripts/transcribe_faster_whisper.py" \
  "$WORK_DIR/source.mp4" \
  "$WORK_DIR/transcript.json"
```

The virtual environment lives inside the disposable work directory, so it does not modify the user's global Python environment.

CPU works but can be slow for long videos. An NVIDIA GPU with a working CUDA runtime is recommended for frequent use. See `references/computer-requirements.md`.

## Validation Gate

Do not deliver until:

- the HTML is a single file and opens offline;
- it contains the five required product layers;
- it has 6-12 highlights;
- all highlight and quote timestamps are valid;
- timestamp links point to the same Bilibili video;
- screenshots render and are embedded;
- transcript search works;
- no local absolute path, secret, downloaded video, or temporary transcript leaks into the HTML;
- mobile text does not overflow or overlap.

If the source lacks reliable subtitles and local transcription cannot run, stop and explain the missing capability. Do not fabricate a note from metadata alone.

## Files

- `scripts/bili_note.py`: prepare, extract frames, render, validate, and clean
- `scripts/transcribe_faster_whisper.py`: optional isolated local ASR
- `references/content-contract.md`: editorial decisions and type adaptation
- `references/note-schema.json`: machine-readable content contract
- `references/computer-requirements.md`: simple hardware guidance
