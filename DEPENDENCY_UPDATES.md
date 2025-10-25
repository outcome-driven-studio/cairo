# Dependency Update Guide

This document tracks dependency updates and potential breaking changes.

## Current Status (2025-10-25)

### Major Version Updates Available

These require careful testing due to potential breaking changes:

#### 1. Sentry (@sentry/node, @sentry/profiling-node)
- **Current:** 7.120.x
- **Latest:** 10.22.0
- **Breaking changes:** Yes (v8, v9, v10 had breaking changes)
- **Action:** Review [Sentry changelog](https://github.com/getsentry/sentry-javascript/releases) before upgrading
- **Priority:** Medium (current version is stable and working)

#### 2. Express
- **Current:** 4.21.2
- **Latest:** 5.1.0  
- **Breaking changes:** Yes (v5 has major breaking changes)
- **Action:** Express v5 is still stabilizing, stay on v4 for now
- **Priority:** Low (v4 is LTS and recommended)

#### 3. UUID
- **Current:** 9.0.1
- **Latest:** 13.0.0
- **Breaking changes:** Possibly (4 major versions jump)
- **Action:** Review changelog, test uuid generation compatibility
- **Priority:** Low (UUID generation is stable API)

#### 4. Dotenv
- **Current:** 16.5.0
- **Latest:** 17.2.3
- **Breaking changes:** Unlikely (minor API surface)
- **Action:** Safe to update, check for new features
- **Priority:** Low

#### 5. Node-cron
- **Current:** 3.0.3
- **Latest:** 4.2.1
- **Breaking changes:** Possibly
- **Action:** Review if affects PeriodicSyncService cron expressions
- **Priority:** Medium (used in core sync functionality)

#### 6. CSV-parse
- **Current:** 5.6.0
- **Latest:** 6.1.0
- **Breaking changes:** Yes (v6 has breaking changes)
- **Action:** Check if CSV parsing is used, test imports
- **Priority:** Low (not critical functionality)

### Patch/Minor Updates (Safe)

These can be updated without concerns:

```bash
npm update axios          # 1.9.0 → 1.12.2
npm update pg             # 8.16.0 → 8.16.3  
npm update winston        # 3.17.0 → 3.18.3
npm update @railway/cli   # 4.6.1 → 4.11.0
```

## Recommended Update Strategy

### Phase 1: Safe Updates (Immediate)
Update patch and minor versions that don't have breaking changes:

```bash
npm update axios pg winston @railway/cli
npm audit fix
npm test
```

### Phase 2: Node-cron Update (This Quarter)
Test on staging environment:

```bash
npm install node-cron@latest
# Test PeriodicSyncService
# Test legacy CronManager
npm test
```

### Phase 3: Sentry Update (Q2 2025)
Major version update requires testing:

```bash
npm install @sentry/node@latest @sentry/profiling-node@latest
# Review migration guide
# Test error tracking
# Verify performance monitoring
```

### Phase 4: Other Major Updates (Q3 2025)
Evaluate Express 5, UUID, csv-parse, dotenv based on:
- Community adoption
- Stability reports
- Feature benefits

## Deprecated Dependencies

### UI Package (ui/package-lock.json)

Several deprecated dependencies in the UI build:

1. **glob** (versions < v9) - Used by build tools
2. **rimraf** (versions < v4) - Used by build tools  
3. **inflight** - Memory leak, but transitive dependency
4. **ESLint config packages** - Replaced by @eslint/config-array

**Action:** These are mostly transitive dependencies from build tools.
- Update build tools (Vite, PostCSS) which will pull newer versions
- Not critical for runtime, only affects build process

## Monitoring Dependencies

### Automated Tools

Consider adding:

```bash
npm install -g npm-check-updates
ncu  # Check for updates

npm install -g depcheck
depcheck  # Find unused dependencies
```

### Regular Schedule

- **Weekly:** Run `npm audit` for security vulnerabilities
- **Monthly:** Check for minor/patch updates with `npm outdated`
- **Quarterly:** Review major version updates and plan testing
- **Annually:** Full dependency audit and cleanup

## Security Updates

Always apply security updates immediately:

```bash
npm audit
npm audit fix

# For major breaking changes with security issues:
npm audit fix --force  # Use with caution!
```

## Testing Checklist

After any dependency update:

- [ ] Run `npm test` (when tests are implemented)
- [ ] Start server and check for errors
- [ ] Test API endpoints (use Postman collection)
- [ ] Test periodic sync functionality
- [ ] Check Sentry for new errors
- [ ] Verify database migrations still work
- [ ] Test WebSocket connections
- [ ] Verify SDK compatibility (when implemented)

## Rollback Plan

If an update causes issues:

```bash
# Check git for previous package.json/package-lock.json
git checkout HEAD~1 package.json package-lock.json

# Reinstall
rm -rf node_modules
npm install

# Or use npm shrinkwrap for production
npm shrinkwrap
```

## Notes

- Always update `package-lock.json` along with `package.json`
- Test on staging/development before production
- Document breaking changes in CHANGELOG.md
- Notify team of major dependency updates
- Keep this document updated with each dependency audit
