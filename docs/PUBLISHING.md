# Publishing @cairo packages (when ready)

Packages live under `packages/` and are **not published to npm yet**.

## Prerequisites

1. Create an npm organization named `cairo` (or change package names).
2. `npm login` with an account that can publish public scoped packages.
3. Each package already has `"publishConfig": { "access": "public" }`.

## Build & publish

```bash
# from repo root
npm install
npm run build

# publish each package (version bump first)
cd packages/tracker && npm version patch && npm publish --access public
cd ../agent-tracker && npm version patch && npm publish --access public
cd ../agent-mcp && npm version patch && npm publish --access public
```

Until then, consumers should install from git/path as documented in the root README.

## Root server package

Root `package.json` is named `cairo` (v3). Publishing it would conflict with the unrelated existing `cairo` package on npm (`0.1.0-alpha.3`). Prefer:

- Distribute the server via git + Docker, or
- Publish as `@cairo/server` / `cairo-cdp` after renaming
