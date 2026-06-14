# Security Policy

## Reporting a vulnerability

Please report security issues privately. **Do not open a public issue for a
vulnerability.**

- Use GitHub's **[Report a vulnerability](../../security/advisories/new)** (Security → Advisories), or
- email the maintainer.

You'll get an acknowledgement, and we'll keep you updated as we investigate and
fix. Please give us a reasonable window to ship a fix before any public
disclosure.

## Security model

Tidy Bookmarks is designed to be private by construction:

- **Local-only.** Permissions are limited to `bookmarks`, `storage`, `favicon`,
  and `sidePanel`. There are **no host permissions** and the extension makes
  **no network requests** — no analytics, no tracking, no telemetry.
- **On-device AI.** Suggestions use Chrome's built-in model (Gemini Nano) on the
  device; if unavailable, a local rule-based fallback is used. Nothing is sent
  off-device.
- **Untrusted input is treated as untrusted.** Bookmark titles/URLs render via
  `textContent` (never `innerHTML`/`eval` — enforced by ESLint); links are gated
  by `isSafeUrl` (http/https only); AI output is sanitized and validated against
  an allowlist of real folder names before any folder is created or changed, and
  destructive actions require explicit confirmation.

## Supply chain

- **Zero runtime dependencies** ship in the extension. `devDependencies`
  (ESLint, Vitest) run only during development/CI.
- `package-lock.json` is committed (exact versions + integrity hashes). CI uses
  `npm ci --ignore-scripts` for reproducible, script-free installs.
- CI runs `npm audit --audit-level=high` on every push and pull request.
- Dependabot watches npm dev-dependencies and GitHub Actions; Actions are pinned
  to commit SHAs.
