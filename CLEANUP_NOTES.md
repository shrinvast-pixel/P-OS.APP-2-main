# Paintship OS — Cleanup Notes

This package keeps the current application as the primary project root.

## Kept
- `src/` — current application source (the newer implementation found at the root of the supplied package)
- `dist/` — current production build output
- Vite / TypeScript / Tailwind / ESLint configuration
- `package.json`
- `package-lock.json` — restored from the matching complete lockfile found in the supplied legacy project
- `legacy/Paintship,OS-legacy.zip` — preserved archive of the older project snapshot, including its `.bolt` metadata

## Removed from the primary root
- The extracted `project/` directory was an older duplicate snapshot of the application and was not used by the current root app.
- The empty root `package-lock.json` was replaced by the complete lockfile that matches the same `package.json` dependencies.

No application source from the older snapshot was discarded: it remains intact inside `legacy/Paintship,OS-legacy.zip`.
