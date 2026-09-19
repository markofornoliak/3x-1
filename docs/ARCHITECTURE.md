# Architecture — Scientific Instrument v2

## Responsibility boundaries

### React application
React owns entry/edit flows, backward-compatible URL state, comparison selection/visibility, saved-exploration metadata, exact accessible summaries, export commands, and secondary menus. React does **not** own per-frame playback or camera motion.

### Computation worker
`src/compute/worker.ts` receives typed messages with explicit request and session IDs. It computes exact `BigInt` trajectories in bounded chunks, yields to the worker event loop, observes cancellation between chunks, and retains only bounded continuation state.

The worker also:
- prepares floating-point projection buffers from exact integers;
- builds extrema-preserving LOD levels and the inspection tree;
- finds shared values/common tails using exact integer equality;
- generates large JSON/CSV exports away from the UI thread.

The default computation boundary remains 10,000 steps. Each explicit continuation adds at most 10,000 steps. A per-trajectory ceiling of 200,000 steps and aggregate session-value budget bound memory growth. Reaching any bound is reported only as truncation/resource exhaustion, never as evidence for convergence or divergence.

### Canvas instrument
`src/visualization/engine/Instrument.ts` accepts already-prepared geometry and exact decimal source values. It owns:
- camera transforms;
- cursor-anchored wheel zoom;
- finger-anchored pinch zoom and one-finger panning;
- interruptible camera transitions;
- visibility/focus state;
- indexed multi-hit inspection;
- timeline playback and scrubbing;
- sparse labels and drawing;
- PNG capture;
- rolling draw-time and complete-frame diagnostics.

Playback advances inside `requestAnimationFrame`. React receives timeline snapshots at a throttled cadence rather than one state update per rendered frame.

## Exactness

Source trajectory values are retained as exact decimal strings on the main thread and as `BigInt` values in the worker session. Floating-point values are used only for projection (log₂(value)) and spatial indexing. Exports use the exact source data.

Comparison common tails are derived from exact equality. If two trajectories reach the same integer at different steps, both step numbers are preserved; the UI never treats that as a same-x-coordinate intersection.

## Persistence

Saved explorations use versioned browser `localStorage` metadata only. They persist inputs, visibility, selected trajectory, camera and playback state—not full trajectory arrays. Reopening a saved exploration recomputes exact data through the worker.

Malformed entries are discarded individually. Storage unavailability and quota failures become user-visible warnings without breaking exploration.

## Static-hosting boundary

There is no application server, authentication service, database or server-side persistence. GitHub Pages hosts immutable static assets. Security analysis is therefore scoped to this client application and repository configuration; it does not claim to audit GitHub’s hosting infrastructure.
