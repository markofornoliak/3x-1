# 3x+1

**3x+1** is an exact, interactive scientific instrument for exploring the Collatz conjecture.

## Product

- Exact Collatz arithmetic with `BigInt`.
- Single exploration and comparison of 2–6 starting integers.
- Canvas 2D renderer with shared step/log₂(value) coordinates, extrema-preserving LOD, indexed inspection, anchored pan/zoom and frame-driven playback.
- Cancellable Web Worker computation with explicit request IDs, stale-result rejection and bounded continuation.
- Exact common-value/common-tail analysis for comparisons, including the distinct step numbers at which trajectories merge.
- Browser-local saved explorations with a versioned schema; no account, database or backend.
- PNG visualization export plus exact JSON and CSV exports.
- Backward-compatible URLs such as `?n=27` and `?mode=compare&n=7,27,31,97`.

## Local development

```bash
npm ci
npm run dev
```

Full validation:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

## Architecture

React owns durable UI state, URL state, saved-session metadata and accessible summaries. A dedicated module worker owns exact trajectory computation, bounded continuation, expensive geometry preprocessing, common-tail analysis and large exact-data exports. The Canvas `Instrument` owns camera state, pointer/keyboard interaction, hit testing, playback, rendering and renderer diagnostics, avoiding React work on every animation frame.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Performance

Synthetic renderer fixtures are explicitly separated from real Collatz calculations. Automated tests cover one 200,000-point path and six simultaneous 100,000-point paths, including overview/deep-zoom indexed inspection and geometry-memory reporting. Runtime draw and complete-frame timing are sampled by the Canvas instrument and exposed through the “Exact data & diagnostics” panel.

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md).

## Deployment and security

Pull requests and `main` are validated with locked dependency installation, typecheck, lint, tests, production build and a high/critical `npm audit` gate. GitHub Actions are pinned to full commit SHAs. Build jobs are read-only; Pages write and OIDC permissions exist only on the deploy job. Dependabot covers npm and GitHub Actions.

GitHub Pages is static hosting and does not provide repository-controlled arbitrary response headers. The application therefore deploys a compatible CSP and referrer policy through HTML metadata; host-level headers such as HSTS, `X-Content-Type-Options`, or `frame-ancestors` cannot be asserted by this repository.

## Live site

https://markofornoliak.github.io/3x-1/
