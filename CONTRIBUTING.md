# Contributing to Cairo

Thank you for considering contributing to Cairo! This guide will help you get started.

## Code of Conduct

Be respectful, constructive, and collaborative. We're building open-source infrastructure together.

## How to Contribute

### Reporting Bugs

Before creating bug reports, check existing issues. When reporting:

- Use a clear and descriptive title
- Include steps to reproduce
- Describe expected vs. actual behavior
- Include your environment (OS, Node version, Postgres version)

### Suggesting Features

Open an issue with the `enhancement` label. Describe:

- What problem it solves
- How it fits the MCP-first, headless architecture
- Example MCP tool interface if applicable

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed MCP tools, update `llms.txt`
4. If you've changed APIs, update the README
5. Ensure `npm test` passes
6. Open a pull request

## Development Setup

```bash
git clone git@github.com:outcome-driven-studio/cairo.git
cd cairo
npm install
cp .env.example .env
# Edit .env with your POSTGRES_URL
npm run migrate
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Server port (default: 8080) |
| `SENTRY_DSN` | No | Sentry error monitoring |
| `DISCORD_WEBHOOK_URL` | No | Discord notifications |
| `SLACK_WEBHOOK_URL` | No | Slack notifications |

### Testing MCP

```bash
# Start the server
npm run dev

# Initialize MCP connection
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: test-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List tools
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-Write-Key: test-key" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Branching Strategy

- `main` - Production-ready code
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation updates

## Commit Messages

We follow Conventional Commits:

```
feat: add BigQuery destination
fix: resolve identity merge race condition
docs: update MCP tool reference in llms.txt
refactor: extract destination routing logic
```

## Project Structure

```
cairo/
  server.js                  # Express entry point, route mounting
  bin/cairo.js               # CLI entry point
  llms.txt                   # Agent-readable documentation
  src/
    routes/                  # API route handlers
    services/                # Business logic
      mcpService.js          # Canonical MCP tool registry
    destinations/            # Destination connector plugins
    migrations/              # Database migration scripts
    utils/                   # Shared utilities
  packages/
    tracker/                 # Universal event tracking SDK
    agent-tracker/           # Agent behavior tracking SDK
    agent-mcp/               # MCP stdio server package
    node-sdk/                # Node.js server-side SDK
```

## Key Contribution Areas

### Adding a New MCP Tool

1. Add the tool registration in `src/services/mcpService.js` under the appropriate category
2. Implement the handler method
3. Update `llms.txt` with the new tool
4. Add the tool to the README table

### Adding a New Destination

1. Create a file in `src/destinations/` implementing the destination interface
2. Register it in `src/destinations/registry.js`
3. Add a database migration if config storage is needed

### Adding a New SDK

1. Create a directory in `packages/`
2. Include `package.json`, `tsconfig.json`, and source in `src/`
3. Add a build script to the root `package.json`
4. Document usage in the README

## Release Process

1. Update version in `package.json`
2. Create a pull request to `main`
3. After merge, create a GitHub release with semantic version tag
4. npm packages are published from CI

## Questions?

Open an issue or start a discussion on GitHub.
