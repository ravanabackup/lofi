# 🎧 LoFi Converter (Web / GitHub Pages)

A browser-based **LoFi / "slowed + reverb"** studio. Drop in any song and turn it
into a dreamy slowed-down, reverbed, surround-widened LoFi track — all processed
**100% client-side** with the Web Audio API. Nothing is uploaded to a server.

This is a static, single-file web remake of
[samarthshrivas/LoFi-Converter-GUI](https://github.com/samarthshrivas/LoFi-Converter-GUI)
(originally a Python/Streamlit app), rebuilt so it can be hosted directly on
**GitHub Pages** with no backend.

## ✨ Features

- 🎚️ **Real-time FX chain** — slowdown (tempo + pitch), convolution **reverb**,
  **low-pass** vinyl tone, **bass boost**, true **mid/side stereo widening**
  (the "surround" feel), and a **bitcrusher** (AudioWorklet).
- 🎛️ **8 rotary knobs** for full control of every parameter.
- 🌙 **Presets** — Slowed + Reverb, Chillhop, Dusty Vinyl, Deep Sleep, Nightcore.
- 🔁 **Transport** — play/pause, stop, seek, **loop**, and an **A/B bypass** to
  compare processed vs. dry.
- 📊 **Live frequency visualizer**.
- 💾 **Export** the finished track as a **WAV** file (rendered offline).
- 🔗 Load from a **file**, a **direct audio URL**, or paste a **YouTube link**
  (preview embed shown — see note below).

## 🚀 Run locally

```bash
npm install
npm run dev      # start the dev server
npm run build    # produce a single self-contained dist/index.html
npm run preview  # preview the production build
```

## 🌐 Deploy to GitHub Pages

The project builds to a **single `index.html`** (via `vite-plugin-singlefile`),
so it works at any URL path — including `https://<user>.github.io/<repo>/`.

**Automatic (recommended):**

> ⚠️ **One-time setup — do this first, or the deploy job will fail.**
> GitHub Pages must be enabled on the repo *before* the workflow can publish.
> The default workflow token can't enable it for you automatically, so:
>
> 1. Go to the repo's **Settings → Pages → Build and deployment → Source**.
> 2. Select **GitHub Actions** (not "Deploy from a branch").
>
> If you skip this, the deploy job errors with
> `Get Pages site failed … Not Found` / `deploy-pages` failing.

Then:

1. Push this repo to GitHub (with the `.github/workflows/deploy.yml` workflow).
2. Push to `main`. The workflow builds and publishes the site automatically.
3. Find the live URL under **Settings → Pages** (or in the workflow run summary).

> 💡 **Troubleshooting `Get Pages site failed … Not Found`** — that exact error
> means Pages isn't enabled yet. Do the one-time setup above, then re-run the
> workflow (Actions tab → “Re-run jobs”). The `configure-pages` step was removed
> so the **build** job now succeeds regardless; only **deploy** needs Pages on.

**Manual (or custom server):**

```bash
npm run build
# upload the contents of ./dist to any static host
```

## ⚠️ A note on YouTube links

Browsers block direct extraction of audio from YouTube (CORS + YouTube's player
protection), so a static site can't download & process YouTube audio the way a
server-side tool can. When you paste a YouTube URL you get an embedded **preview
player**; to fully LoFi-process a song, download the audio file and drop it into
the app.

## 🛠️ Tech

React + Vite + TypeScript + Tailwind CSS · Web Audio API (BiquadFilter,
ConvolverNode, mid/side stereo matrix, AudioWorklet bitcrusher,
OfflineAudioContext WAV rendering).
