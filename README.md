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

The production Vite base path is `/3x-plus-1/`. Pushes to `main` run `.github/workflows/deploy.yml`, which validates the project, builds the production bundle and deploys the Pages artifact with GitHub's official Pages actions.

## Live site

https://markofornoliak.github.io/3x-plus-1/
