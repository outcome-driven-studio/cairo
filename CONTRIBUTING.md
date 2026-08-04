# Contributing to Cairo

## Code of Conduct

Be respectful, constructive, and collaborative.

## How to Contribute

### Bugs / features

- Clear title, repro steps, expected vs actual
- Feature ideas should fit the agent-first, MCP-first model (event ingest + agent notification handoff — not CDP destination fan-out)

### Pull Requests

1. Branch from `main` as `growth/<feature>`
2. Add tests for behavior changes
3. If you change MCP tools, update `llms.txt` and verify `GET /docs`
4. Ensure `npm test` passes
5. Open a PR

## Development Setup

```bash
git clone git@github.com:outcome-driven-studio/cairo.git
cd cairo
cp .env.example .env.local
# set POSTGRES_URL
npm install
npm run migrate
npm start
```

Insert a write key:

```sql
INSERT INTO write_keys (key, name) VALUES ('dev-key', 'local');
```

## Architecture notes

- Primary interface: `POST /mcp`
- Product ingest: `POST /v2/track` / `POST /v2/batch` (also under `/api/v2`)
- Notifications hand off to agents; agents relay via their own gateways (Cairo never talks to Slack/Discord/etc.)
- Packages live under `packages/` (workspaces): `@ani-hq/tracker`, `@ani-hq/agent-tracker`, `@ani-hq/agent-mcp`, `@ani-hq/cairo-mcp`, `@ani-hq/cairo-relay`
- Keep examples gateway-agnostic — no product- or fleet-specific hostnames in docs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
