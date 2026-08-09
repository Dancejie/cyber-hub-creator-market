# Cyber Hub Creator Market

Public, deployment-ready fallback for the Cyber Hub 3D creator market.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FDancejie%2Fcyber-hub-creator-market)

## What is included

- The prebuilt 3D world under `site/`
- 195 participant appearances (173 local runtime GLBs and 22 CDN-mapped GLBs)
- 42 supporter appearances
- 102 project booths and 367 project media files
- Character and project search, direct control, group-photo placement, and no-UI photo mode
- A Render Blueprint that publishes the prebuilt bundle without rebuilding or recompressing assets

## Public fallback behavior

The Cowork edition uses company SSO and PostgreSQL for shared likes, comments, and intent totals. This public static fallback deliberately does not expose that internal backend. When the API is absent, social state falls back to the current browser's local storage; the 3D world itself remains fully playable.

## Render

`render.yaml` declares a static site whose publish directory is `site`. No package installation or source build is required.

## Archived Cowork package

The [2026-08-06 GitHub Release](https://github.com/Dancejie/cyber-hub-creator-market/releases/tag/cowork-backup-2026-08-06) preserves the independently validated Cowork ZIP used to create this public fallback. Its SHA-256 is `96cf853144970db8afa2859bfa2aff6658200230f08870efeb01355e6cdfbcce`.

## Rights

This repository is a preview deployment artifact. No license is granted for third-party project media, participant likenesses, or character assets.
