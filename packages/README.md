# Cairo CDP SDKs

This directory contains the Cairo CDP SDKs for different platforms.

## ⚠️ Development Status

**Current Status:** SDKs are in active development and **not yet published to npm**.

### Available SDKs

- **node-sdk** - Node.js/Express server-side SDK
- **react-sdk** - React/Next.js client-side SDK  
- **browser-sdk** - Vanilla JavaScript browser SDK

## Building SDKs Locally

To build all SDKs:

```bash
# From repository root
npm run build:sdks

# Or build individually
npm run build:sdk:node
npm run build:sdk:react
npm run build:sdk:browser
```

## Using SDKs Locally (Development)

Since the SDKs are not yet published to npm, you can use them locally:

### Option 1: npm link (Recommended for development)

```bash
# In the SDK directory
cd packages/node-sdk
npm install
npm run build
npm link

# In your project
npm link @cairo/node-sdk
```

### Option 2: Direct file path

In your project's `package.json`:

```json
{
  "dependencies": {
    "@cairo/node-sdk": "file:../cairo/packages/node-sdk"
  }
}
```

### Option 3: Use the Cairo API directly

Until SDKs are published, you can use the Cairo API directly:

```javascript
const axios = require('axios');

// Track event
await axios.post('http://your-cairo-instance/api/events/track', {
  user_email: 'user@example.com',
  event: 'Button Clicked',
  properties: { button: 'signup' }
});
```

## Publishing Roadmap

Before SDKs can be published to npm, we need to:

- [ ] Complete TypeScript compilation setup for all SDKs
- [ ] Add comprehensive tests for each SDK
- [ ] Set up CI/CD for automated publishing
- [ ] Create npm organization (@cairo)
- [ ] Write detailed usage documentation
- [ ] Add example projects for each SDK

## SDK Development Guidelines

### TypeScript Setup

Each SDK should have:
- `src/` - TypeScript source files
- `dist/` - Compiled JavaScript (git-ignored)
- `tsconfig.json` - TypeScript configuration
- `package.json` with `main`, `types`, and `files` properly configured

### Testing

Each SDK should include:
- Unit tests with Jest
- Integration tests against Cairo API
- Mock server for offline testing

### Documentation

Each SDK should have:
- README.md with installation and usage
- API reference documentation
- Code examples
- TypeScript type definitions

## Contributing

If you'd like to contribute to SDK development:

1. Pick an SDK to work on
2. Check KNOWN_ISSUES.md for SDK-related tasks
3. Follow the TypeScript setup guidelines above
4. Submit a PR with tests and documentation

## Questions?

See the main README.md or open an issue on GitHub.
