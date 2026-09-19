# 3x+1

**3x+1** is an interactive visual exploration of the Collatz conjecture. Enter any positive integer and watch its exact trajectory unfold one transformation at a time through a cinematic 2D mathematical space.

## What the site does

- Calculates Collatz trajectories dynamically with `BigInt` arithmetic.
- Animates each `3n + 1` and `n ÷ 2` operation progressively.
- Uses a smooth camera model that follows the active computation and fits the completed trajectory.
- Represents the terminal `4 → 2 → 1 → 4` cycle without overstating it visually.
- Supports play/pause, stepping, restart, random starts, speed controls, pan, zoom, fit, fullscreen and clean presentation mode.
- Shares starting values with GitHub Pages-safe query URLs such as `?n=27`.
- Adapts to desktop, tablet and mobile, including touch gestures and reduced-motion preferences.

## Technology

React · TypeScript · Vite · SVG · Vitest · ESLint · GitHub Actions / GitHub Pages

## Local development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

Production build:

```bash
npm run build
```

## Deployment

The production Vite base path is `/3x-1/`. Pushes to `main` run `.github/workflows/deploy.yml`, which validates the project, builds the production bundle and deploys the Pages artifact with GitHub's official Pages actions.

## Live site

https://markofornoliak.github.io/3x-1/

## Instrument renderer

The main graph uses a dedicated Canvas 2D engine (`src/visualization/engine/Instrument.ts`). React owns inputs, URL selection, controls, and accessible summaries. The engine owns its camera, pointer gestures, indexed inspection, requestAnimationFrame playback, and drawing. Canvas is the primary renderer, so a missing WebGL context requires no fallback switch. Legacy SVG components are retained for reference but are not imported by the application.

- BigInt mathematics and the `?n=...&mode=compare` contract are unchanged. The existing 10,000-step computation cap remains; the renderer is independently tested with 200,000 synthetic points.
- All paths share step/log₂(value) coordinates. Projection uses leading integer bits to avoid overflow; original values remain exact in data inspection.
- Preprocessing builds cached ordered min/max envelopes and a bounding tree. Each frame culls offscreen x intervals and selects an envelope for current pixel density. Inspection queries the original points using branch-and-bound; LOD never replaces the exact source values.
- Playback runs inside the engine and takes 4–30 seconds at 1×, depending on length. It does not recenter the camera while running. React receives only playback state changes and inspections, not animation frames.
- Pointer capture supports drag/pinch; wheel zoom is anchored to the pointer. Double-click/tap and Reset View fit all paths. Arrow keys pan, +/- zoom, and 0 resets the focused canvas.
- Selecting a comparison chip focuses its path; selecting it again fits all. Exact data provides keyboard-operated per-step inspection. Reduced motion disables camera interpolation and playback starts paused for everyone.
- ResizeObserver resizes backing pixels with DPR capped at 2. Idle views schedule no frames. `destroy()` removes event listeners, disconnects observation, and cancels animation.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Geometry tests cover projection, endpoint/extrema preservation, shared comparison coordinates, camera inversion/zoom anchoring, indexed lookup against exhaustive results, and 200k-point preprocessing/LOD bounds.
