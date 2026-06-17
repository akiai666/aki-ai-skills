#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import mimetypes
import os
import re
import secrets
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://codex.cygces.com/v1"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_SIZE = "1024x1536"
DEFAULT_OUTPUT_ROOT = Path("outputs")


VARIANTS = [
    {
        "id": "v1-foreground-impact",
        "label": "广角前景冲脸",
        "prompt": (
            "Variant focus: wide-angle foreground impact. Put Aki on the right side in a confident "
            "cover-ready pose, with one hand, fingertip, compact tool cube, or glowing memory module "
            "pushing toward the lens near the lower center. Build a center-burst composition around "
            "that foreground object. Use strong depth of field: foreground object sharp and large, "
            "Aki in the midground, dark circular tech tunnel in the background. Keep the face readable "
            "and natural; do not distort facial features."
        ),
    },
    {
        "id": "v2-title-pressure",
        "label": "3D大字压迫",
        "prompt": (
            "Variant focus: maximum title pressure. Make the title the dominant physical object: "
            "huge glossy extruded 3D block characters, slightly tilted, close to the frame edges, "
            "with thick dark side planes, cast shadows, and perspective compression. Aki appears as "
            "a strong foreground/midground cutout beside or under the title, supporting the visual "
            "hierarchy without covering the words. Keep the background simpler than the title."
        ),
    },
    {
        "id": "v3-energy-ring",
        "label": "环形能量场",
        "prompt": (
            "Variant focus: ring-shaped energy field. Use a neon lime-green and cool-blue circular "
            "energy ring behind Aki and the title, with subtle rotating light trails, strong tunnel "
            "depth, and controlled fisheye feeling only at the outer edges. The composition should "
            "feel like the viewer is being pulled toward the center, but it must stay clean and "
            "readable as a social-media thumbnail."
        ),
    },
]


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_api_key(env_path: Path | None) -> str:
    env_file = read_env_file(env_path) if env_path else {}
    key = (
        os.getenv("CYGCES_HERMES_API_KEY")
        or os.getenv("CYGCES_API_KEY")
        or env_file.get("CYGCES_HERMES_API_KEY")
        or env_file.get("CYGCES_API_KEY")
    )
    if not key:
        raise SystemExit("Missing CYGCES_HERMES_API_KEY or CYGCES_API_KEY")
    return key


def resolve_reference(cli_value: Path | None, env_name: str, label: str) -> Path:
    raw_value = cli_value or os.getenv(env_name)
    if not raw_value:
        raise SystemExit(f"Missing {label}. Pass it with --{label} or set {env_name}.")
    return Path(raw_value).expanduser().resolve()


def make_title_slug(title: str) -> str:
    compact = re.sub(r"\s+", "", title.strip())
    compact = re.sub(r'[\\/:*?"<>|\n\r\t，,。.!！?？、；;：:（）()【】\[\]{}《》“”"\'`]+', "-", compact)
    compact = re.sub(r"-+", "-", compact).strip("-")
    return (compact[:40] or "cover").strip("-") or "cover"


def split_title_lines(title: str) -> list[str]:
    explicit = [line.strip() for line in title.splitlines() if line.strip()]
    if len(explicit) > 1:
        return explicit

    normalized = re.sub(r"\s+", " ", title.strip())
    parts = [part.strip() for part in re.split(r"[，,；;：:、]+", normalized) if part.strip()]
    if 2 <= len(parts) <= 4:
        return parts

    text = normalized
    if len(text) <= 12:
        return [text]
    if len(text) <= 22:
        mid = len(text) // 2
        return [text[:mid].strip(), text[mid:].strip()]

    chunk = max(8, len(text) // 3)
    lines = [text[:chunk].strip(), text[chunk : chunk * 2].strip(), text[chunk * 2 :].strip()]
    return [line for line in lines if line]


def add_form_field(parts: list[bytes], boundary: str, name: str, value: str) -> None:
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
    parts.append(value.encode("utf-8"))
    parts.append(b"\r\n")


def add_file_field(parts: list[bytes], boundary: str, name: str, path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"Reference image not found: {path}")
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        (
            f'Content-Disposition: form-data; name="{name}"; '
            f'filename="{path.name}"\r\nContent-Type: {mime_type}\r\n\r\n'
        ).encode()
    )
    parts.append(path.read_bytes())
    parts.append(b"\r\n")


def build_multipart(fields: dict[str, str], references: list[Path]) -> tuple[bytes, str]:
    boundary = "----aki-viral-cover-" + secrets.token_hex(16)
    parts: list[bytes] = []
    for key, value in fields.items():
        add_form_field(parts, boundary, key, value)
    for ref in references:
        add_file_field(parts, boundary, "image[]", ref)
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), boundary


def request_image(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    out: Path,
    size: str,
    timeout: int,
    references: list[Path],
) -> dict[str, str]:
    url = base_url.rstrip("/") + "/images/edits"
    body, boundary = build_multipart(
        {
            "model": model,
            "prompt": prompt,
            "size": size,
            "n": "1",
            "response_format": "b64_json",
        },
        references,
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer" + " " + api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload: Any = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"Cygces image API error {exc.code}: {detail[:1200]}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Cygces image API request failed: {exc}") from exc

    if "error" in payload:
        detail = json.dumps(payload["error"], ensure_ascii=False)
        raise SystemExit(f"Cygces image API error: {detail[:1200]}")

    data = payload.get("data") or payload.get("images") or payload.get("output") or []
    if isinstance(data, dict):
        data = [data]
    if not data:
        raise SystemExit("Cygces image API returned no image data")

    image = data[0]
    b64 = image.get("b64_json") or image.get("base64")
    if b64:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(base64.b64decode(b64))
        return {"kind": "b64", "out": str(out)}

    image_url = image.get("url")
    if image_url:
        with urllib.request.urlopen(image_url, timeout=timeout) as resp:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(resp.read())
        return {"kind": "url", "out": str(out)}

    raise SystemExit("Cygces image API returned no b64_json/base64/url image")


def build_prompt(title: str, title_lines: list[str], variant: dict[str, str]) -> str:
    rendered_lines = "\n".join(f'- "{line}"' for line in title_lines)
    return f"""Use case: ads-marketing
Asset type: native 3:4 Aki IP short-video / Xiaohongshu cover, 1024x1536.

Input images:
- Image 1 is the identity reference. Use it only to preserve Aki's face, glasses, forward fringe hairstyle, red jacket, and white cutout stroke.
- Image 2 is the visual style reference. Use it only for the black-green futuristic cover language, glossy extruded 3D title, high contrast, tech tunnel depth, and social-media thumbnail composition.

Primary request:
Generate one new cover for the topic title below. This is not an edit of either reference image. Create a fresh composition while keeping the same Aki IP visual system.

Exact title text, preserve wording:
{rendered_lines}

Title layout:
- Use the title as the first visual focus.
- Split the title into the listed lines.
- Render all title text accurately, with no missing characters, no extra words, and no garbled Chinese.
- Use huge bold beveled 3D block typography.
- Most title front faces should be bright white or warm white.
- One key phrase or one line may use solid neon lime green for emphasis.
- 3D depth must come from thick side planes, dark green side faces, cast shadows, perspective, and partial spatial occlusion.
- Do not use colored outlines around white title faces, rainbow gradients, dirty gray stone, cement, aged metal, or thin flat text.

Fixed Aki IP constraints:
- Aki is an Asian male AI creator with glasses, forward fringe hairstyle, red outdoor jacket, and friendly confident expression.
- Keep face identity consistent with Image 1.
- Add a clear white cutout stroke around the person.
- Do not replace the red jacket.
- Avoid distorted face, strange teeth, broken glasses, malformed hands, or horror expression.

Base visual language:
- Dark black futuristic AI command center or circular tech tunnel.
- Neon lime green and cool blue accents.
- Strong high-contrast lighting, cinematic poster layering, foreground/midground/background depth.
- Small restrained UI modules or glowing tool cards are allowed, but keep them secondary.
- No fake logos, no watermarks, no QR codes, no platform UI, no unrelated English words.
- Do not turn this into a generic cyberpunk poster, game poster, product ad, or cluttered dashboard.

{variant["prompt"]}

Quality target:
Readable at mobile thumbnail size, polished self-media cover, dramatic but coherent, consistent with Aki's black-green Aki IP cover style.
"""


def write_metadata(path: Path, metadata: dict[str, Any]) -> None:
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate three 3:4 Aki IP viral cover variants via Cygces gpt-image-2.")
    parser.add_argument("--title", required=True, help="Exact cover title text.")
    parser.add_argument("--out-dir", type=Path, help="Output directory. Defaults to a timestamped folder under ./outputs.")
    parser.add_argument("--variants", type=int, default=3, choices=[1, 2, 3], help="Number of variants to generate from the fixed recipe set.")
    parser.add_argument("--size", default=DEFAULT_SIZE, help="Image size for the API. Default: 1024x1536.")
    parser.add_argument("--timeout", type=int, default=300, help="Per-image API timeout in seconds.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="OpenAI-compatible base URL.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Image model name.")
    parser.add_argument("--env-file", type=Path, help="Optional dotenv-style file containing CYGCES_HERMES_API_KEY or CYGCES_API_KEY.")
    parser.add_argument("--person-reference", type=Path, help="Aki identity reference image. Can also be set with AKI_IP_PERSON_REFERENCE.")
    parser.add_argument("--style-reference", type=Path, help="Cover style reference image. Can also be set with AKI_IP_STYLE_REFERENCE.")
    parser.add_argument("--prompt-only", action="store_true", help="Only write prompts and metadata; do not call the image API.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    title = args.title.strip()
    if not title:
        raise SystemExit("Title cannot be empty")

    title_slug = make_title_slug(title)
    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = args.out_dir or DEFAULT_OUTPUT_ROOT / f"{timestamp}-{title_slug}"
    out_dir = out_dir.expanduser().resolve()
    prompts_dir = out_dir / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    person_reference = resolve_reference(args.person_reference, "AKI_IP_PERSON_REFERENCE", "person-reference")
    style_reference = resolve_reference(args.style_reference, "AKI_IP_STYLE_REFERENCE", "style-reference")
    if not person_reference.exists():
        raise SystemExit(f"Person reference not found: {person_reference}")
    if not style_reference.exists():
        raise SystemExit(f"Style reference not found: {style_reference}")

    selected_variants = VARIANTS[: args.variants]
    title_lines = split_title_lines(title)
    metadata: dict[str, Any] = {
        "status": "prompt_only" if args.prompt_only else "running",
        "title": title,
        "title_lines": title_lines,
        "title_slug": title_slug,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "model": args.model,
        "base_url": args.base_url,
        "size": args.size,
        "person_reference": str(person_reference),
        "style_reference": str(style_reference),
        "variants": [],
    }
    metadata_path = out_dir / "metadata.json"

    env_file = args.env_file.expanduser().resolve() if args.env_file else None
    api_key = "" if args.prompt_only else resolve_api_key(env_file)
    references = [person_reference, style_reference]

    for index, variant in enumerate(selected_variants, start=1):
        prompt = build_prompt(title, title_lines, variant)
        prompt_file = prompts_dir / f"{index:02d}-{variant['id']}.md"
        prompt_file.write_text(prompt, encoding="utf-8")

        output_file = out_dir / f"封面-3x4-{title_slug}-{variant['id']}.png"
        variant_meta: dict[str, Any] = {
            "id": variant["id"],
            "label": variant["label"],
            "prompt_file": str(prompt_file),
            "output_file": str(output_file),
        }

        if not args.prompt_only:
            result = request_image(
                base_url=args.base_url,
                api_key=api_key,
                model=args.model,
                prompt=prompt,
                out=output_file,
                size=args.size,
                timeout=args.timeout,
                references=references,
            )
            variant_meta["result"] = result

        metadata["variants"].append(variant_meta)
        write_metadata(metadata_path, metadata)

    metadata["status"] = "complete" if not args.prompt_only else "prompt_only"
    write_metadata(metadata_path, metadata)
    print(json.dumps({"out_dir": str(out_dir), "metadata": str(metadata_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
