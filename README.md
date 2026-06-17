# Aki AI Skills

Public Aki AI skill templates.

This repository contains selected public skills from Aki's private skill workspace. It currently contains:

- `aki-ip-viral-cover`: generate three high-impact Aki IP cover variants from a title.

## Usage

Each skill lives under `skills/<skill-name>/` and includes its own `SKILL.md`.

The public templates do not include private portraits, private style references, credentials, or generated drafts. Follow each skill's reference instructions and provide your own local inputs.

## Maintenance model

Public skills can be improved directly in this repository. Aki's private skill workspace records the last public commit it has synced.

- Public-first change: edit this repository, push, then run `pull-public` from the private workspace.
- Private-first change: run `publish-public` from the private workspace. It will refuse to overwrite public changes to the same managed files since the last synced public commit.

## License

MIT
