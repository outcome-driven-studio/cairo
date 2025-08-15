# Contributing to Cairo

First off, thank you for considering contributing to Cairo! It's people like you that make Cairo such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- Use a clear and descriptive title
- Describe the exact steps which reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed after following the steps
- Explain which behavior you expected to see instead and why
- Include screenshots if relevant
- Include your environment details (OS, Node version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- Use a clear and descriptive title
- Provide a step-by-step description of the suggested enhancement
- Provide specific examples to demonstrate the steps
- Describe the current behavior and explain which behavior you expected to see instead
- Explain why this enhancement would be useful

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these issues:

- Issues labeled `good-first-issue` - issues which should only require a few lines of code
- Issues labeled `help-wanted` - issues which should be a bit more involved than beginner issues

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

1. Fork and clone the repo

```bash
git clone git@github.com:outcome-driven-studio/cairo.git
cd cairo
```

2. Install dependencies

```bash
npm install
```

3. Copy the environment template

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database

```bash
# Create PostgreSQL database
createdb cairo

# Run migrations
node src/migrations/run_migrations.js

# Set up lead scoring
node setup-lead-scoring.js
```

5. Start development server

```bash
npm run dev
```

## Development Process

### Branching Strategy

- `main` - Production-ready code
- `develop` - Development branch (create PRs here)
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation updates

### Commit Messages

We follow the Conventional Commits specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only changes
- `style:` - Code style changes (formatting, etc)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:

```bash
feat: add Salesforce integration
fix: resolve Apollo API timeout issue
docs: update README with Docker instructions
```

### Code Style

- Use ESLint for JavaScript linting
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### Testing

```bash
# Run all tests
npm test

# Run specific test
npm test -- --grep "Apollo"

# Run with coverage
npm run test:coverage
```

### Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new functions
- Update API documentation for endpoint changes
- Include examples in documentation

## Project Structure

```
cairo/
├── src/
│   ├── app.js              # Express app setup
│   ├── config/             # Configuration files
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   └── migrations/         # Database migrations
├── test/                   # Test files
├── scripts/                # Utility scripts
└── docs/                   # Documentation
```

## Key Areas for Contribution

### High Priority

1. **New Integrations**

   - HubSpot CRM
   - Salesforce
   - Clearbit enrichment
   - Segment destination

2. **Features**

   - Custom scoring rules UI
   - Real-time WebSocket updates
   - Data export functionality
   - Multi-tenant support

3. **Performance**
   - Query optimization
   - Caching layer
   - Batch processing improvements

### Good First Issues

1. **Documentation**

   - API examples
   - Integration guides
   - Video tutorials

2. **Testing**

   - Increase test coverage
   - Add integration tests
   - Performance benchmarks

3. **UI Improvements**
   - Dashboard enhancements
   - Mobile responsiveness
   - Dark mode

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a pull request to `main`
4. After merge, create a GitHub release
5. Tag the release with semantic version

## Questions?

Feel free to:

- Open an issue for questions
- Join our Discord community
- Email the maintainers

## Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- Our website

Thank you for contributing to SuperSync! 🚀
