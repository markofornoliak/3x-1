# Reproducible benchmarks

## Automated fixtures

Run:

```bash
npm ci
npm test
```

`src/visualization/benchmark.test.ts` reports:

1. **Synthetic 200,000-point renderer fixture** — geometry preprocessing plus 2,000 indexed inspections at overview scale and 2,000 at 32× deep zoom.
2. **Synthetic 6 × 100,000-point renderer fixture** — preprocessing time and transferred geometry memory.
3. **Real Collatz calculations** — representative exact trajectories timed separately from synthetic renderer fixtures.

Synthetic fixtures are intentionally labelled and are not presented as Collatz trajectories.

## Runtime frame diagnostics

The production Canvas instrument keeps a bounded rolling sample of:
- drawing time;
- complete `requestAnimationFrame` handler time.

Open **Exact data & diagnostics → Sample renderer diagnostics** after interacting with the graph to read average and p95 values. This separates drawing cost from total frame work.

## Interaction stress procedure

For release verification:
- rapidly replace the input several times to exercise worker cancellation/stale-result rejection;
- pan and wheel/pinch zoom while playback runs;
- scrub repeatedly between the beginning, peak and end;
- switch trajectory focus/visibility in six-way comparison mode;
- save, reopen and delete sessions repeatedly;
- mount/unmount by moving between the entry page and visualization;
- test desktop-wide, laptop, tablet and iPhone-sized browser viewports.

Browser viewport tests are emulation unless explicitly performed on physical hardware. Physical-device results must not be inferred from responsive emulation.

## GPU decision

Canvas 2D remains the production renderer unless measured runtime draw/frame distributions show it is the bottleneck. A GPU path is not introduced speculatively; avoiding it keeps exact inspection, accessibility and fallback behavior simpler while current LOD/culling bounds drawn geometry.
