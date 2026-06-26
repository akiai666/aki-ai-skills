# Aki AI Skills

Open-source Aki AI skills.

This repository contains public, reusable skill templates. It currently contains:

- `aki-ip-viral-cover`: generate three high-impact Aki IP cover variants from a title.
- `interflow-video-cut`: turn a local talking-head video into a card-based HUD overlay video.

## Usage

Each skill lives under `skills/<skill-name>/` and includes its own `SKILL.md`.

The public templates must not include private portraits, private style references, credentials, generated drafts, or local-only cache paths. Follow each skill's reference instructions and provide your own local inputs.

## Maintenance model

Use this repository for skills Aki wants to share or open-source. Keep personal-only workflows, secrets, generated media, and private assets out of this repo.

- Open-source change: edit this repository, verify, commit, and push.
- Local install refresh: copy the approved public skill into the active agent skill directory.
- If a skill is not public-safe yet, sanitize it before adding it here.

Install or refresh a public skill locally:

```bash
bash scripts/sync_to_agents.sh interflow-video-cut
```

## License

MIT
