# F1 Racing runtime snapshot

Source snapshot: `/Users/dangsijie/.openclaw/workspace/cowork/oddprix`

Integrated on 2026-07-31 for the Pawprint Odyssey World Hub.

- The runtime reuses `../../media/worlds/f1-racing/entry.mp4` instead of
  copying the 38 MB source master into the deployment a second time.
- Large lossless ground textures use the source project's web-sized JPEG
  alternatives. Model geometry, track data, panoramas, controls and HUD are
  unchanged.
- The supplied `Lose My Mind` mix remains the runtime BGM. Its element volume
  is reduced to match the World Hub landing-film loudness.
- Re-sync only runtime files; never copy the source `.cowork` metadata or its
  local deployment configuration into this repository.
