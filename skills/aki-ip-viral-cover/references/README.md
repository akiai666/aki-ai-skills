# References

This public template does not include real identity or style reference images.

Prepare two local images before running the script:

- Person reference: A clear portrait or cutout that defines the face, glasses, hairstyle, clothing, and outline style.
- Style reference: A cover image that defines the black-green tech look, 3D typography, lighting, and composition language.

Pass them with:

```bash
python3 skills/aki-ip-viral-cover/scripts/generate_viral_cover.py \
  --title "Your title" \
  --person-reference "/path/to/person-reference.png" \
  --style-reference "/path/to/style-reference.png"
```

Do not commit private portraits, unpublished style references, credentials, or generated drafts to a public skill repository.
