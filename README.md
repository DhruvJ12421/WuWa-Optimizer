# Tacet Lab

Tacet Lab is a local-first Echo scanner, build optimizer, team calculator, and build-card generator for Wuthering Waves. It is a fan-made project and is not affiliated with Kuro Games.

## What the MVP does

- Reads English Echo details from a user-approved WuWa window share in Chrome or Edge.
- Accepts PNG, JPEG, and WebP screenshots when live sharing is inconvenient.
- Requires review and correction before any OCR result enters the inventory.
- Stores Echoes, builds, teams, and settings in browser IndexedDB.
- Builds Spectro Rover, Chixia, and Baizhi with representative weapons.
- Calculates normal, critical, expected, rotation, and contribution damage.
- Searches a bounded Echo candidate pool in a cancellable Web Worker.
- Exports full or compact build cards as PNG files.
- Exports and restores a versioned local JSON backup.

## Privacy

There is no account, backend, analytics, telemetry, or upload endpoint.

```text
WuWa window -> browser MediaStream -> local crop -> local English OCR
            -> review queue -> IndexedDB
```

Window sharing starts only after a browser permission prompt. Audio is disabled. Stopping the share ends every media track. Imported screenshots remain in memory only while their OCR candidate is being reviewed.

See [docs/privacy.md](docs/privacy.md) for the complete boundary.

## Current limitations

- OCR supports English game UI only.
- Live scanning targets 1920x1080 and 2560x1440 16:9 layouts.
- Mobile supports viewing/editing, not live game-window capture.
- Character and attack values are marked `mvp-2026.07-unverified` and must be checked against the current English in-game UI before damage output is considered authoritative.
- The 95% OCR target has not been claimed because a real, anonymized fixture corpus is not present yet.
- Optimizer searches are deliberately bounded for responsiveness and do not prove a global optimum across an unlimited inventory.

## Local development

```powershell
npm install
npm run dev
```

Localhost is a secure browser context and supports `getDisplayMedia`. For another device or hostname, use HTTPS.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Automated coverage includes formulas, buff timelines, optimizer constraints, OCR parsing, stable-frame detection, account persistence, the review checkpoint, and application navigation. Real capture accuracy follows the protocol in [docs/ocr-fixtures.md](docs/ocr-fixtures.md).

## Deployment

The site is configured for static GitHub Pages hosting. After a `package-lock.json` exists and Pages is configured to use GitHub Actions, pushes to `main` or `master` run type checking, tests, and the production build before deployment.

See [docs/architecture.md](docs/architecture.md) for module responsibilities and [docs/game-data.md](docs/game-data.md) for the data verification policy.
