# Known Issues & Technical Debt

This document tracks known issues, TODOs, and technical debt in the Cairo CDP codebase.

## High Priority

### 1. Attio Event Tracking Not Implemented
**Location:** `src/routes/productEventRoutes.js:208`

**Issue:** The `createEvent` method in AttioService is not implemented for event tracking.

**Current behavior:** Events are tracked in database and Mixpanel, but not synced to Attio in real-time.

**Workaround:** Events are synced to Attio during periodic sync cycles via user metadata.

**Action needed:** Implement `AttioService.createEvent()` method or determine if event sync is needed.

---

### 2. SDK Write Key Validation Missing
**Location:** `src/routes/sdkRoutes.js:54`

**Issue:** Write keys are accepted without database validation.

**Security impact:** Medium - currently relies on obscurity, no key revocation mechanism.

**Action needed:** 
- Create `api_keys` table
- Implement key generation and validation
- Add key rotation mechanism

---

### 3. User Merging Logic Not Implemented
**Location:** `src/routes/sdkRoutes.js:549`

**Issue:** When `alias` method is called, users should be merged but currently no-op.

**Impact:** User identity resolution across devices/sessions is incomplete.

**Action needed:** Implement user aliasing logic to merge anonymous and identified users.

---

## Medium Priority

### 4. Full Sync Job Persistence
**Location:** `src/routes/fullSyncJobRoutes.js:364`

**Issue:** Job status is in-memory only, not persisted to database.

**Impact:** Job history is lost on server restart.

**Action needed:** Save job records to `background_jobs` table.

---

### 5. Job-Specific Logging
**Location:** `src/routes/fullSyncJobRoutes.js:442`

**Issue:** Job logs are mixed with application logs, no per-job log files.

**Impact:** Difficult to debug specific job failures.

**Action needed:** Implement job-specific log streams or database log storage.

---

### 6. Table-Specific Connection Validation
**Location:** `src/routes/configRoutes.js:441`

**Issue:** Connection status always returns `true`, doesn't actually test connection.

**Impact:** Configuration UI shows "connected" even when database is down.

**Action needed:** Add actual connection health check per integration.

---

## Low Priority

### 7. Legacy Range Format in Scoring
**Location:** `src/services/leadScoringService.js:137-148`

**Issue:** Scoring config supports both legacy string format ("1M-10M") and new numeric ranges.

**Impact:** None currently, but adds complexity.

**Action needed:** Migrate all configs to new format, remove legacy support.

---

### 8. Deprecated calculateScores Method
**Location:** `src/services/periodicSyncService.js:561`

**Issue:** Generic `calculateScores` method is deprecated in favor of specific methods.

**Impact:** None if not called externally.

**Action needed:** Remove deprecated method after confirming no external usage.

---

### 9. Console.log in Debug Code
**Location:** Multiple files (see KNOWN_ISSUES_DETAIL.md)

**Issue:** Several console.log statements remain in production code, mostly in test/demo files.

**Status:** ✅ Fixed in main src/services/ files (2025-10-25)

**Remaining:** Test and demo files still use console.log (acceptable for those contexts)

---

## Documentation Debt

### 10. Incomplete SDK Documentation
**Status:** SDKs exist in `/packages/` but are not built or published to npm.

**Action needed:**
- Add build scripts to compile TypeScript
- Set up npm publishing workflow
- Update README with actual npm install instructions

---

### 11. Migration System Documentation
**Status:** Multiple migration systems coexist (SQL, JS, migration service).

**Action needed:** ✅ Documented in DATABASE_SCHEMA_GUIDE.md (2025-10-25)

---

## Resolved Issues

### ✅ Dual Entry Points (server.js vs src/app.js)
**Resolved:** 2025-10-25  
**Action:** Deprecated src/app.js, documented root server.js as canonical entry point.

---

### ✅ Database URL Confusion (DATABASE_URL vs POSTGRES_URL)
**Resolved:** 2025-10-25  
**Action:** Documented precedence in .env.example, both supported for compatibility.

---

### ✅ Legacy Cron Jobs Without Deprecation Warning
**Resolved:** 2025-10-25  
**Action:** Added deprecation warnings and conflict detection in server.js.

---

### ✅ Database Table Naming Inconsistency
**Resolved:** 2025-10-25  
**Action:** Created DATABASE_SCHEMA_GUIDE.md documenting table naming conventions and namespace system.

---

## Contributing

When fixing issues from this list:

1. Reference the issue number in your commit message
2. Update this document to move issue to "Resolved Issues"
3. Add tests to prevent regression
4. Update related documentation

## Maintenance Notes

- **Last updated:** 2025-10-25
- **Review frequency:** Monthly
- **Triage priority:** High > Medium > Low > Documentation Debt
