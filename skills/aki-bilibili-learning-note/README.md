# Long Video Learning Note

Turn one Bilibili link into a reading-first, self-contained HTML learning note.

It is designed around a simple behavior:

> Read the whole idea, jump to the moments that matter, keep the result.

## What You Get

- a 30-second value preview;
- 6-12 timestamped highlights with screenshots;
- a continuous illustrated learning article;
- highlighted quotes, evidence, risks, and disagreements;
- exact links back to the original Bilibili moment;
- a searchable timestamped transcript;
- one portable HTML file with no account or web service required.

The layout adapts to interviews, tutorials, business analysis, and talks.

## Use As An Agent Skill

Install the directory in your agent's skill folder, then send a prompt such as:

```text
把这个 B 站视频做成 HTML 学习笔记：
https://www.bilibili.com/video/BV...
```

The agent follows `SKILL.md`, prepares the source, analyzes the transcript, and produces the HTML.

## Requirements

- Python 3.9+
- `ffmpeg` and `ffprobe`
- `yt-dlp`
- Optional local ASR: `faster-whisper`

No API key is required by the default workflow. See
`references/computer-requirements.md` for practical hardware guidance.

## Privacy

Processing is local by default. Temporary media stays in a disposable work
directory and is removed after the final HTML passes validation.

Generated notes may contain copyrighted transcript excerpts and screenshots.
Use them for personal learning unless you have permission to redistribute them.

## License

MIT. This project borrows the product principle of returning readers to the
original video, but does not copy LongCut code or interface.
