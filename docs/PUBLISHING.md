# Publishing @ani-hq packages

Packages publish under the existing **`ani-hq`** npm org.

## One-time setup

1. Automation token with publish access to `ani-hq`: https://www.npmjs.com/settings/~/tokens
2. Add as GitHub secret **`NPM_TOKEN`**, or `export NPM_TOKEN=npm_...`

Root package is **private** (server ships via git + Docker).

## Publish

```bash
export NPM_TOKEN=npm_...
chmod +x scripts/publish-packages.sh
./scripts/publish-packages.sh

# dry run:
DRY_RUN=true ./scripts/publish-packages.sh
```

Or Actions → **Publish npm packages** → Run workflow.

## Packages

- `@ani-hq/tracker`
- `@ani-hq/agent-tracker`
- `@ani-hq/agent-mcp`
- `@ani-hq/cairo-mcp`
