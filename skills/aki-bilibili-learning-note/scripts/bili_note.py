#!/usr/bin/env python3
"""Prepare and render a Bilibili long-video learning note."""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse


REQUIRED_SECTIONS = (
    'id="quick-preview"',
    'id="highlights"',
    'id="article"',
    'id="verification"',
    'id="transcript"',
)


def fail(message: str, code: int = 1) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(code)


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        check=False,
        text=True,
        capture_output=capture,
    )
    if result.returncode:
        detail = result.stderr.strip() if capture else "command failed"
        fail(f"{' '.join(command[:3])}: {detail}")
    return result.stdout if capture else ""


def load_json(path: Path) -> dict | list:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read JSON {path}: {exc}")


def write_json(path: Path, value: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_bilibili_url(url: str) -> tuple[str, int]:
    match = re.search(r"(BV[0-9A-Za-z]{10,})", url)
    if not match:
        fail("expected a Bilibili URL containing a BV id")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    part_raw = query.get("p", ["1"])[0]
    try:
        part = max(1, int(part_raw))
    except ValueError:
        part = 1
    return match.group(1), part


def format_time(seconds: float | int) -> str:
    value = max(0, int(float(seconds)))
    hours, remainder = divmod(value, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def timestamp_url(meta: dict, seconds: float | int) -> str:
    bvid = meta["bvid"]
    part = int(meta.get("part", 1))
    return f"https://www.bilibili.com/video/{bvid}/?p={part}&t={max(0, int(float(seconds)))}"


def command_doctor(_: argparse.Namespace) -> None:
    checks = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "yt-dlp": shutil.which("yt-dlp"),
        "ffmpeg": shutil.which("ffmpeg"),
        "ffprobe": shutil.which("ffprobe"),
    }
    for name, value in checks.items():
        status = "OK" if value else "MISSING"
        print(f"{status:7} {name:8} {value or ''}")
    if not all(checks[name] for name in ("yt-dlp", "ffmpeg", "ffprobe")):
        raise SystemExit(1)


def vtt_timestamp(value: str) -> float:
    fields = value.replace(",", ".").split(":")
    try:
        if len(fields) == 3:
            return int(fields[0]) * 3600 + int(fields[1]) * 60 + float(fields[2])
        return int(fields[0]) * 60 + float(fields[1])
    except (ValueError, IndexError):
        return 0.0


def parse_vtt_or_srt(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    timing = re.compile(
        r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+"
        r"(?P<end>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})[^\n]*\n"
        r"(?P<body>.*?)(?=\n{2,}|\Z)",
        re.S,
    )
    segments = []
    for match in timing.finditer(text):
        body = re.sub(r"<[^>]+>", "", match.group("body"))
        body = re.sub(r"\s+", " ", body).strip()
        if body and (not segments or body != segments[-1]["text"]):
            segments.append(
                {
                    "start": round(vtt_timestamp(match.group("start")), 3),
                    "end": round(vtt_timestamp(match.group("end")), 3),
                    "text": html.unescape(body),
                }
            )
    return segments


def parse_json_subtitle(path: Path) -> list[dict]:
    data = load_json(path)
    events = data.get("events", []) if isinstance(data, dict) else []
    segments = []
    for event in events:
        parts = event.get("segs") or []
        text_value = "".join(part.get("utf8", "") for part in parts).strip()
        if not text_value or text_value == "\n":
            continue
        start = float(event.get("tStartMs", 0)) / 1000
        end = start + float(event.get("dDurationMs", 0)) / 1000
        segments.append({"start": round(start, 3), "end": round(end, 3), "text": text_value})
    return segments


def discover_transcript(work_dir: Path) -> list[dict]:
    candidates = sorted(
        path
        for path in work_dir.iterdir()
        if path.suffix.lower() in {".vtt", ".srt", ".json3"}
    )
    for path in candidates:
        segments = parse_json_subtitle(path) if path.suffix == ".json3" else parse_vtt_or_srt(path)
        if segments:
            return segments
    return []


def command_prepare(args: argparse.Namespace) -> None:
    bvid, part = parse_bilibili_url(args.url)
    work_dir = Path(args.work_dir).expanduser().resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    metadata_raw = run(["yt-dlp", "--dump-single-json", "--no-playlist", args.url], capture=True)
    metadata = json.loads(metadata_raw)
    source = {
        "title": metadata.get("title") or bvid,
        "subtitle": metadata.get("description", "").splitlines()[0][:180],
        "bvid": bvid,
        "source_url": f"https://www.bilibili.com/video/{bvid}/",
        "part": part,
        "duration_seconds": metadata.get("duration") or 0,
        "creator": metadata.get("uploader") or "",
        "published_at": metadata.get("upload_date") or "",
        "thumbnail": metadata.get("thumbnail") or "",
    }
    write_json(work_dir / "source.json", source)

    run(
        [
            "yt-dlp",
            "--no-playlist",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            "zh-CN,zh-Hans,zh-Hant,zh,en",
            "--sub-format",
            "vtt",
            "--skip-download",
            "-o",
            str(work_dir / "source.%(ext)s"),
            args.url,
        ]
    )
    transcript = discover_transcript(work_dir)
    if transcript:
        write_json(work_dir / "transcript.json", transcript)

    if not args.no_video:
        run(
            [
                "yt-dlp",
                "--no-playlist",
                "-f",
                "bv*[height<=720]+ba/b[height<=720]",
                "--merge-output-format",
                "mp4",
                "-o",
                str(work_dir / "source.%(ext)s"),
                args.url,
            ]
        )

    print(f"prepared: {work_dir}")
    print(f"metadata: {work_dir / 'source.json'}")
    if transcript:
        print(f"transcript: {work_dir / 'transcript.json'} ({len(transcript)} segments)")
    else:
        print("transcript: unavailable; run the local transcription fallback", file=sys.stderr)


def find_source_video(work_dir: Path) -> Path:
    candidates = [
        path
        for path in work_dir.glob("source.*")
        if path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}
    ]
    if not candidates:
        fail(f"no source video found in {work_dir}")
    return sorted(candidates)[0]


def safe_id(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "-", value).strip("-") or "frame"


def command_frames(args: argparse.Namespace) -> None:
    note_path = Path(args.note).expanduser().resolve()
    note = load_json(note_path)
    work_dir = Path(args.work_dir).expanduser().resolve()
    source_video = find_source_video(work_dir)
    frame_dir = work_dir / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    changed = False

    items = list(note.get("highlights", [])) + list(note.get("article_sections", []))
    for index, item in enumerate(items):
        if item.get("image_path") or item.get("start") is None:
            continue
        frame_path = frame_dir / f"{safe_id(str(item.get('id', index)))}.jpg"
        run(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-ss",
                str(float(item["start"])),
                "-i",
                str(source_video),
                "-frames:v",
                "1",
                "-q:v",
                "3",
                "-vf",
                "scale='min(1280,iw)':-2",
                "-y",
                str(frame_path),
            ]
        )
        item["image_path"] = os.path.relpath(frame_path, note_path.parent)
        changed = True

    if changed:
        write_json(note_path, note)
    print(f"frames: {frame_dir}")


def image_data(path_value: str | None, base_dir: Path) -> str:
    if not path_value:
        return ""
    path = Path(path_value)
    if not path.is_absolute():
        path = base_dir / path
    if not path.is_file():
        return ""
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def e(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def emphasis_html(text: str, emphasis: str | None) -> str:
    if not emphasis or emphasis not in text:
        return e(text)
    before, marked, after = text.partition(emphasis)
    return f"{e(before)}<strong>{e(marked)}</strong>{e(after)}"


def source_link(meta: dict, start: float | int, label: str = "回到原片") -> str:
    return (
        f'<a class="time-link" href="{e(timestamp_url(meta, start))}" '
        f'target="_blank" rel="noopener">{e(label)} · {format_time(start)}</a>'
    )


def list_html(items: list, class_name: str = "") -> str:
    return f'<ul class="{class_name}">' + "".join(f"<li>{e(item)}</li>" for item in items) + "</ul>"


def render_watch_first(note: dict) -> str:
    meta = note["meta"]
    items = []
    for item in note["quick_preview"]["watch_first"]:
        if isinstance(item, dict) and item.get("start") is not None:
            title = item.get("title") or format_time(item["start"])
            items.append(f"<li>{source_link(meta, item['start'], title)}</li>")
        else:
            items.append(f"<li>{e(item)}</li>")
    return '<ul class="watch-first">' + "".join(items) + "</ul>"


def render_highlights(note: dict, base_dir: Path) -> str:
    meta = note["meta"]
    blocks = []
    for item in note["highlights"]:
        image = image_data(item.get("image_path"), base_dir)
        media = f'<img src="{image}" alt="{e(item["title"])}">' if image else ""
        blocks.append(
            f"""
            <article class="highlight-card">
              <div class="highlight-media">{media}<span class="type">{e(item["type"])}</span></div>
              <div class="highlight-body">
                <h3>{e(item["title"])}</h3>
                <p>{e(item["summary"])}</p>
                {source_link(meta, item["start"], "从这里看原片")}
              </div>
            </article>"""
        )
    return "".join(blocks)


def render_article(note: dict, base_dir: Path) -> str:
    meta = note["meta"]
    sections = []
    for index, section in enumerate(note["article_sections"], 1):
        image = image_data(section.get("image_path"), base_dir)
        figure = (
            f'<figure><img src="{image}" alt="{e(section["title"])}">'
            f'<figcaption>{source_link(meta, section.get("start", 0), "查看画面出处")}</figcaption></figure>'
            if image
            else ""
        )
        paragraphs = []
        for paragraph in section["paragraphs"]:
            speaker = (
                f'<span class="speaker">{e(paragraph["speaker"])}</span>'
                if paragraph.get("speaker")
                else ""
            )
            timestamp = (
                source_link(meta, paragraph["start"], "原片")
                if paragraph.get("start") is not None
                else ""
            )
            body = emphasis_html(paragraph["text"], paragraph.get("emphasis"))
            paragraphs.append(f"<p>{speaker}{body} {timestamp}</p>")
        summary = f'<p class="section-summary">{e(section.get("summary"))}</p>' if section.get("summary") else ""
        sections.append(
            f"""
            <section class="article-section" id="{e(section["id"])}">
              <div class="section-number">{index:02d}</div>
              <h2>{e(section["title"])}</h2>
              {summary}{figure}{''.join(paragraphs)}
            </section>"""
        )
    return "".join(sections)


def render_quotes(note: dict) -> str:
    meta = note["meta"]
    return "".join(
        f"""
        <blockquote>
          <p>“{e(item["text"])}”</p>
          <footer>{e(item.get("speaker") or "原视频")}
          {source_link(meta, item["start"], "听原话")}</footer>
          {f'<small>{e(item.get("context"))}</small>' if item.get("context") else ''}
        </blockquote>"""
        for item in note.get("quotes", [])
    )


def render_evidence(note: dict) -> str:
    meta = note["meta"]
    cards = []
    for item in note.get("evidence", []):
        start = item.get("start")
        link = source_link(meta, start, "核对原片") if start is not None else ""
        value = f'<div class="evidence-value">{e(item.get("value"))}</div>' if item.get("value") else ""
        caveat = f'<small>{e(item.get("caveat"))}</small>' if item.get("caveat") else ""
        cards.append(
            f'<article class="evidence-card">{value}<h3>{e(item.get("label"))}</h3>'
            f'<p>{e(item.get("text"))}</p>{caveat}{link}</article>'
        )
    return "".join(cards)


def render_disagreements(note: dict) -> str:
    blocks = []
    for item in note.get("disagreements", []):
        positions = item.get("positions", [])
        blocks.append(
            f'<article class="disagreement"><h3>{e(item.get("title"))}</h3>'
            f'{list_html(positions)}'
            f'<p>{e(item.get("resolution"))}</p></article>'
        )
    return "".join(blocks)


def render_transcript(note: dict) -> str:
    meta = note["meta"]
    rows = []
    for index, segment in enumerate(note["transcript"]):
        speaker = f'<b>{e(segment["speaker"])}</b>' if segment.get("speaker") else ""
        search_text = f'{segment.get("speaker", "")} {segment["text"]}'.lower()
        rows.append(
            f'<div class="transcript-row" data-search="{e(search_text)}">'
            f'{source_link(meta, segment["start"], format_time(segment["start"]))}'
            f'<p>{speaker}{e(segment["text"])}</p></div>'
        )
    return "".join(rows)


def command_render(args: argparse.Namespace) -> None:
    note_path = Path(args.note).expanduser().resolve()
    note = load_json(note_path)
    validate_note(note)
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    meta = note["meta"]
    preview = note["quick_preview"]
    chapters = note.get("chapters") or [
        {"title": section["title"], "start": section.get("start", 0), "id": section["id"]}
        for section in note["article_sections"]
    ]
    chapter_nav = "".join(
        f'<a href="#{e(item.get("id", ""))}"><span>{format_time(item.get("start", 0))}</span>'
        f'{e(item["title"])}</a>'
        for item in chapters
    )
    tags = "".join(f"<span>{e(tag)}</span>" for tag in meta.get("tags", []))
    participants = " · ".join(meta.get("participants", []))
    source_url = timestamp_url(meta, 0)
    caveats = list_html(note.get("caveats", []), "caveats") if note.get("caveats") else "<p>无额外说明。</p>"
    actions = list_html(note.get("actions", []), "actions") if note.get("actions") else ""
    disagreement_html = render_disagreements(note)

    document = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{e(meta["title"])} · 学习导航</title>
<style>
:root{{--ink:#18201f;--muted:#65706d;--paper:#f7f5ef;--white:#fff;--line:#d9ddd8;--teal:#0b6b63;--yellow:#f4c95d;--red:#b4483e;--max:1120px}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.78 system-ui,-apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif;letter-spacing:0}}
a{{color:inherit}}img{{display:block;width:100%;height:100%;object-fit:cover}}.wrap{{width:min(var(--max),calc(100% - 40px));margin:auto}}
.hero{{min-height:72vh;background:#153e3a;color:#fff;display:flex;align-items:flex-end;padding:72px 0 56px;border-bottom:8px solid var(--yellow)}}
.eyebrow,.type{{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}}h1{{font-size:clamp(38px,6vw,78px);line-height:1.08;letter-spacing:0;max-width:980px;margin:18px 0}}
.dek{{font-size:20px;max-width:760px;color:#dceae7}}.meta{{display:flex;flex-wrap:wrap;gap:10px 18px;color:#c5d6d2;font-size:14px}}.tags{{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}}.tags span{{border:1px solid #78a09a;padding:4px 9px;border-radius:4px}}
.source-button,.time-link{{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:750;color:var(--teal);font-size:13px}}.source-button{{margin-top:26px;background:var(--yellow);color:#202622;padding:10px 14px;border-radius:4px}}
main{{padding:54px 0 100px}}.band{{padding:48px 0;border-bottom:1px solid var(--line)}}.section-head{{display:grid;grid-template-columns:190px 1fr;gap:28px;margin-bottom:28px}}.section-head h2{{font-size:34px;line-height:1.2;margin:0}}.section-head p{{margin:3px 0;color:var(--muted)}}
.preview-grid{{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line)}}.preview-cell{{background:var(--white);padding:24px;min-height:180px}}.preview-cell.primary{{grid-row:span 2;background:#fff8df}}.preview-cell h3{{font-size:13px;color:var(--muted);margin:0 0 12px}}.preview-cell p{{font-size:19px;line-height:1.55;margin:0}}.preview-cell li{{margin:4px 0}}
.highlight-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}.highlight-card{{display:grid;grid-template-columns:42% 1fr;background:var(--white);border:1px solid var(--line);border-radius:6px;overflow:hidden;min-height:230px}}.highlight-media{{position:relative;background:#dce3df;min-height:190px}}.highlight-media:empty:after{{content:"VIDEO MOMENT";position:absolute;inset:0;display:grid;place-items:center;color:#73807c;font-size:12px}}.highlight-media .type{{position:absolute;top:10px;left:10px;background:var(--yellow);padding:3px 8px;border-radius:3px}}.highlight-body{{padding:20px}}.highlight-body h3{{margin:0 0 8px;font-size:20px;line-height:1.35}}.highlight-body p{{margin:0 0 16px;color:#44504d}}
.reading-layout{{display:grid;grid-template-columns:230px minmax(0,720px);gap:70px;align-items:start}}.chapter-nav{{position:sticky;top:20px;border-top:3px solid var(--ink)}}.chapter-nav a{{display:grid;grid-template-columns:58px 1fr;padding:12px 0;border-bottom:1px solid var(--line);text-decoration:none;font-size:13px}}.chapter-nav span{{color:var(--teal);font-variant-numeric:tabular-nums}}
.article-section{{margin-bottom:64px;scroll-margin-top:20px}}.article-section h2{{font-size:32px;line-height:1.25;margin:0 0 12px}}.section-number{{font:800 13px/1 system-ui;color:var(--red);margin-bottom:10px}}.section-summary{{font-size:19px;font-weight:700;border-left:4px solid var(--yellow);padding-left:16px}}.article-section>p{{font-size:18px;margin:18px 0}}.article-section strong{{background:linear-gradient(transparent 58%,#f7d979 58%);font-weight:800}}.speaker{{color:var(--teal);font-size:13px;font-weight:800;margin-right:8px}}figure{{margin:28px 0}}figure img{{aspect-ratio:16/9;border:1px solid var(--line)}}figcaption{{margin-top:8px}}
.quote-grid,.evidence-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}blockquote{{margin:0;background:#173c38;color:#fff;padding:28px;border-radius:6px}}blockquote p{{font:700 23px/1.55 Georgia,"Songti SC",serif;margin:0 0 18px}}blockquote footer{{display:flex;justify-content:space-between;gap:10px;color:#d1e0dd}}blockquote .time-link{{color:var(--yellow)}}blockquote small,.evidence-card small{{display:block;margin-top:10px;color:#aebfbc}}
.evidence-card,.disagreement{{background:var(--white);border:1px solid var(--line);padding:22px;border-radius:6px}}.evidence-value{{font-size:30px;font-weight:850;color:var(--red)}}.evidence-card h3,.disagreement h3{{margin:4px 0 8px}}.evidence-card p{{color:#44504d}}.disagreement{{margin-top:16px;border-left:5px solid var(--red)}}.actions li{{margin:8px 0}}
details{{background:var(--white);border:1px solid var(--line);border-radius:6px}}summary{{cursor:pointer;padding:18px 22px;font-weight:800}}.transcript-tools{{padding:0 20px 16px}}#transcript-search{{width:100%;padding:12px;border:1px solid #aab3b0;border-radius:4px;font:inherit}}.transcript-list{{max-height:680px;overflow:auto;border-top:1px solid var(--line)}}.transcript-row{{display:grid;grid-template-columns:100px 1fr;gap:18px;padding:13px 20px;border-bottom:1px solid #edf0ed}}.transcript-row p{{margin:0}}.transcript-row b{{display:block;color:var(--teal);font-size:12px}}.caveats{{color:var(--muted)}}.footer{{padding:30px 0;background:#172321;color:#b8c4c1;text-align:center;font-size:13px}}
@media(max-width:800px){{.wrap{{width:min(100% - 28px,var(--max))}}.hero{{min-height:64vh;padding:48px 0 38px}}h1{{font-size:40px}}.dek{{font-size:17px}}.section-head,.reading-layout{{grid-template-columns:1fr;gap:22px}}.chapter-nav{{position:static;display:none}}.preview-grid,.highlight-grid,.quote-grid,.evidence-grid{{grid-template-columns:1fr}}.preview-cell.primary{{grid-row:auto}}.highlight-card{{grid-template-columns:1fr}}.highlight-media{{aspect-ratio:16/9}}.article-section h2{{font-size:27px}}.article-section>p{{font-size:17px}}.transcript-row{{grid-template-columns:76px 1fr;padding:12px}}}}
@media print{{.hero{{min-height:auto}}.time-link,.source-button,.transcript-tools{{display:none}}details{{border:0}}details>summary{{display:none}}details:not([open])>*:not(summary){{display:block}}.transcript-list{{max-height:none}}}}
</style>
</head>
<body>
<header class="hero"><div class="wrap">
  <div class="eyebrow">Long Video Learning Note · {e(meta["content_type"])}</div>
  <h1>{e(meta["title"])}</h1>
  <p class="dek">{e(meta.get("subtitle"))}</p>
  <div class="meta"><span>{e(meta.get("creator"))}</span><span>{e(participants)}</span><span>{format_time(meta["duration_seconds"])}</span><span>阅读约 {e(preview["reading_minutes"])} 分钟</span></div>
  <div class="tags">{tags}</div>
  <a class="source-button" href="{e(source_url)}" target="_blank" rel="noopener">打开 B 站原视频</a>
</div></header>
<main>
<section class="band" id="quick-preview"><div class="wrap">
  <div class="section-head"><h2>30 秒判断</h2><p>先决定值不值得投入时间，再选择读全文或跳看原片。</p></div>
  <div class="preview-grid">
    <div class="preview-cell primary"><h3>最重要的结论</h3><p>{e(preview["main_conclusion"])}</p></div>
    <div class="preview-cell"><h3>这条视频讲什么</h3><p>{e(preview["what_it_is"])}</p></div>
    <div class="preview-cell"><h3>适合谁看</h3>{list_html(preview["suitable_for"])}</div>
    <div class="preview-cell"><h3>优先回看的内容</h3>{render_watch_first(note)}</div>
    <div class="preview-cell"><h3>阅读成本</h3><p>约 {e(preview["reading_minutes"])} 分钟</p></div>
  </div>
</div></section>
<section class="band" id="highlights"><div class="wrap">
  <div class="section-head"><h2>视频高光地图</h2><p>不是机械章节，而是最值得回到原片感受的观点、故事、案例和分歧。</p></div>
  <div class="highlight-grid">{render_highlights(note, note_path.parent)}</div>
</div></section>
<section class="band" id="article"><div class="wrap">
  <div class="section-head"><h2>图文学习全文</h2><p>保留推理、上下文和人物立场，顺着读完即可掌握整体脉络。</p></div>
  <div class="reading-layout"><nav class="chapter-nav">{chapter_nav}</nav><article>{render_article(note, note_path.parent)}</article></div>
</div></section>
<section class="band"><div class="wrap">
  <div class="section-head"><h2>原话与金句</h2><p>保留说话方式，也保留回到现场的入口。</p></div>
  <div class="quote-grid">{render_quotes(note)}</div>
</div></section>
<section class="band" id="verification"><div class="wrap">
  <div class="section-head"><h2>证据、分歧与行动</h2><p>把事实、预测、立场和可行动结论分开，方便后续查证。</p></div>
  <div class="evidence-grid">{render_evidence(note)}</div>
  {disagreement_html}
  {actions}
  <h3>阅读说明</h3>{caveats}
</div></section>
<section class="band" id="transcript"><div class="wrap">
  <div class="section-head"><h2>时间戳逐字稿</h2><p>默认折叠。搜索术语或人物，点击时间即可核对原话。</p></div>
  <details><summary>展开完整逐字稿 · {len(note["transcript"])} 段</summary>
    <div class="transcript-tools"><input id="transcript-search" type="search" placeholder="搜索逐字稿"></div>
    <div class="transcript-list">{render_transcript(note)}</div>
  </details>
</div></section>
</main>
<footer class="footer"><div class="wrap">基于原视频整理 · 重要决策请回到原片并独立查证</div></footer>
<script>
const input=document.querySelector("#transcript-search");
const rows=[...document.querySelectorAll(".transcript-row")];
input?.addEventListener("input",()=>{{const q=input.value.trim().toLowerCase();rows.forEach(row=>row.hidden=q&&!row.dataset.search.includes(q));}});
</script>
</body></html>"""
    output.write_text(document, encoding="utf-8")
    print(f"rendered: {output}")


def validate_note(note: dict) -> None:
    required = ("meta", "quick_preview", "highlights", "article_sections", "quotes", "transcript")
    missing = [key for key in required if key not in note]
    if missing:
        fail(f"note JSON missing: {', '.join(missing)}")
    meta = note["meta"]
    for key in ("title", "bvid", "source_url", "duration_seconds", "content_type"):
        if not meta.get(key):
            fail(f"note meta missing: {key}")
    if not 6 <= len(note["highlights"]) <= 12:
        fail("highlights must contain 6-12 items")
    duration = float(meta["duration_seconds"])
    watch_items = [
        item
        for item in note["quick_preview"].get("watch_first", [])
        if isinstance(item, dict)
    ]
    timed_items = watch_items + list(note["highlights"]) + list(note["quotes"]) + list(note["transcript"])
    for item in timed_items:
        start = float(item.get("start", -1))
        if start < 0 or start > duration + 5:
            fail(f"timestamp outside video duration: {start}")
    if not note["transcript"]:
        fail("transcript must not be empty")


def command_validate(args: argparse.Namespace) -> None:
    path = Path(args.html).expanduser().resolve()
    if not path.is_file():
        fail(f"HTML not found: {path}")
    content = path.read_text(encoding="utf-8")
    errors = []
    for marker in REQUIRED_SECTIONS:
        if marker not in content:
            errors.append(f"missing section {marker}")
    if "data:image/" not in content:
        errors.append("no embedded screenshot found")
    if not re.search(r"bilibili\.com/video/BV[0-9A-Za-z]+/\?p=\d+&amp;t=\d+", content):
        errors.append("no Bilibili timestamp link found")
    if re.search(r"(?:file://|/Users/|[A-Za-z]:\\\\Users\\\\)", content):
        errors.append("local absolute path leaked into HTML")
    if "id=\"transcript-search\"" not in content or "data-search=" not in content:
        errors.append("searchable transcript is incomplete")
    if errors:
        for error in errors:
            print(f"FAIL {error}", file=sys.stderr)
        raise SystemExit(1)
    print(f"PASS {path}")


def command_clean(args: argparse.Namespace) -> None:
    work_dir = Path(args.work_dir).expanduser().resolve()
    if not work_dir.exists():
        print(f"already clean: {work_dir}")
        return
    marker_names = {"source.json", "transcript.json", "note.json"}
    if not marker_names.intersection(path.name for path in work_dir.iterdir()):
        fail(f"refusing to remove unrecognized work directory: {work_dir}")
    shutil.rmtree(work_dir)
    print(f"removed: {work_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    doctor = commands.add_parser("doctor", help="check local prerequisites")
    doctor.set_defaults(func=command_doctor)

    prepare = commands.add_parser("prepare", help="download metadata, subtitles, and source")
    prepare.add_argument("url")
    prepare.add_argument("--work-dir", required=True)
    prepare.add_argument("--no-video", action="store_true")
    prepare.set_defaults(func=command_prepare)

    frames = commands.add_parser("frames", help="extract frames for note items")
    frames.add_argument("--work-dir", required=True)
    frames.add_argument("--note", required=True)
    frames.set_defaults(func=command_frames)

    render = commands.add_parser("render", help="render a self-contained HTML note")
    render.add_argument("--note", required=True)
    render.add_argument("--output", required=True)
    render.set_defaults(func=command_render)

    validate = commands.add_parser("validate", help="validate a rendered HTML note")
    validate.add_argument("html")
    validate.set_defaults(func=command_validate)

    clean = commands.add_parser("clean", help="remove a recognized disposable work directory")
    clean.add_argument("--work-dir", required=True)
    clean.set_defaults(func=command_clean)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
