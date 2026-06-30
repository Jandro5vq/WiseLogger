# AGENTS.md — WiseLogger

Notes for future agents (and humans) working on this repo.

## Versioning & releases

**The displayed app version is the git tag on `main`.** Releases are **always** tagged
on `main` — going forward, every release must have a corresponding annotated tag.

### Semantic versioning (`MAJOR.MINOR.PATCH`)

Baseline is **`v1.1.3`**. Bump from there following semver:

- **PATCH** (`1.1.3 → 1.1.4`): bug fixes, no behaviour changes for the user.
- **MINOR** (`1.1.3 → 1.2.0`): new features, **and changes to time/calculation algorithms**
  (split/merge/balance/auto-close logic, etc.).
- **MAJOR** (`1.1.3 → 2.0.0`): breaking changes (data model migrations that aren't
  backward-compatible, removed endpoints, etc.).

Keep `package.json` `version` in sync with the tag (it's the fallback when git is
unavailable), but the **tag on `main` is the source of truth**.

### How the version reaches the UI

1. `next.config.mjs` → `resolveAppVersion()` computes the version at **build time** and
   exposes it as `NEXT_PUBLIC_APP_VERSION`. Resolution priority:
   1. `APP_VERSION` env var (explicit override).
   2. `git describe --tags --always --dirty` (the tag on the current commit).
   3. `v<package.json version>` (last-resort fallback).
2. `src/lib/version.ts` re-exports it as `APP_VERSION` (client + server safe).
3. `src/components/layout/sidebar.tsx` renders it at the bottom of the sidebar — do **not**
   prepend `v`, the resolved string already carries it.

### Why the override / build arg exists

`.dockerignore` excludes `.git`, so `git describe` does **not** work inside the Docker
build. The tag must be passed in as a build arg:

```bash
docker build --build-arg APP_VERSION=$(git describe --tags) .
# or with compose:
APP_VERSION=$(git describe --tags) docker compose build
```

If omitted, the build falls back to the `package.json` version, so the UI is never blank.

### Release checklist

When cutting a release:

1. Land all changes on `main`.
2. Tag main: `git tag -a vX.Y.Z -m "vX.Y.Z"` then `git push origin vX.Y.Z`.
3. (Optional) Keep `package.json` `version` roughly in sync as the fallback — the **tag is
   the source of truth**, package.json is only used when git is unavailable.
4. Build with the tag passed through (`--build-arg APP_VERSION=...`) so the deployed
   container shows the right version.

> Note: on commits made after a tag, `git describe --tags` returns `vX.Y.Z-N-gHASH`
> (N commits past the tag) until the next release is tagged. A clean tagged commit
> shows just `vX.Y.Z`.
