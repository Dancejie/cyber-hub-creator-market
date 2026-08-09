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

The GitHub Release asset preserves the independently validated Cowork ZIP used to create this public fallback.

## Rights

This repository is a preview deployment artifact. No license is granted for third-party project media, participant likenesses, or character assets.
