# MiniMax H3 skills snapshot

Director's offline catalog in `skills.ts` is adapted from the official
[`MiniMax-AI/MiniMax-H3/skills`](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills)
tree at revision `d21241f0a4b3acbb34c97dae47fa417b7065e438`.

Snapshot adaptation version: `1`.

Included upstream definitions:

- `h3-prompt-writing` (permanent technical base; Director selects the equivalent
  of upstream `references/base-en.txt` or `references/ref-en.txt` by project mode)
- `minimalist-product-ad-generator`
- `3d-animation-short-generator`
- `papercraft-stop-motion-explainer`
- `brand-promo-video-generator`
- `music-video-subtitle-generator`
- `co-op-game-intro-generator`
- `paper-collage-explainer-generator`
- `handdrawn-live-video-generator`

The eight style workflows are compact offline adaptations for Director and
Maestro. Hub-specific orchestration, choice cards, intermediate asset generation,
canvas operations, and unavailable tools are intentionally excluded. The source
revision and adaptation version are persisted in every project profile so future
migrations can be deterministic.
