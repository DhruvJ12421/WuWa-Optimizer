# Architecture

## Runtime boundaries

Tacet Lab is a static React application. It has no server runtime.

```text
Screen share / screenshot
  -> scanner capture and preprocessing
  -> Tesseract English worker
  -> typed review candidate
  -> explicit user approval
  -> Dexie / IndexedDB
  -> pure calculation modules
  -> optimizer Web Worker
  -> React views and local PNG/JSON exports
```

## Modules

- `src/domain/` owns serializable types, stat aggregation, damage, rotations, buffs, and optimization. Domain functions do not access the DOM or storage.
- `src/game-data/` owns versioned display metadata and the initial character/weapon slice.
- `src/scanner/` owns window capture, image crops, frame stability, English OCR parsing, validation, and fixture accuracy accounting.
- `src/storage/` owns IndexedDB tables, seed repair, schema validation, atomic import, export, and reset.
- `src/workers/` isolates expensive optimization from the render thread. Tesseract.js manages its own OCR worker.
- `src/ui/` owns application state projection and workflows. UI code calls domain/storage modules but does not define damage formulas.

## Persistence

`AccountDocument` is the portable public format. Every export includes `schemaVersion`, `gameDataVersion`, and `exportedAt`. Imports are deeply validated before an atomic replacement transaction starts. Future schema changes must add a migration rather than silently accepting incompatible data.

## Optimizer

The optimizer filters excluded/assigned items, applies locked items first, ranks candidates per objective, limits each cost group, and explores combinations within a visited-node budget. It enforces five Echoes, 12 total cost, optional five-piece Sonata, minimum calculated stats, and deterministic result ordering.

The bounded pool is a responsiveness trade-off. UI wording must not claim a mathematically global optimum.

## Offline behavior

The PWA precaches built application assets. Previously requested Tesseract worker, WASM, and English model resources are cached with a one-year CacheFirst policy. The first OCR run therefore requires network access; later runs can use the cached resources.
