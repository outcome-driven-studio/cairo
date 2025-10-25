# Cairo CDP Documentation Index

Quick reference to all documentation files in this repository.

---

## 📚 Public Documentation (For All Users)

### Getting Started
- **[README.md](./README.md)** - Main project documentation, features, and API reference
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Detailed setup instructions
- **[SDK_QUICK_START.md](./SDK_QUICK_START.md)** - SDK integration guide (5-minute start)
- **[USER_GUIDE.md](./USER_GUIDE.md)** - Non-technical user guide for dashboard

### Development & Contributing
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute to Cairo CDP
- **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** - Community guidelines
- **[CAIRO_CDP_ROADMAP.md](./CAIRO_CDP_ROADMAP.md)** - Product roadmap and future plans

### Technical Guides
- **[DATABASE_SCHEMA_GUIDE.md](./DATABASE_SCHEMA_GUIDE.md)** - Database tables, namespaces, migrations
- **[KNOWN_ISSUES.md](./KNOWN_ISSUES.md)** - Known bugs and technical debt tracking
- **[DEPENDENCY_UPDATES.md](./DEPENDENCY_UPDATES.md)** - Dependency management strategy
- **[PERIODIC_SYNC_TROUBLESHOOTING.md](./PERIODIC_SYNC_TROUBLESHOOTING.md)** - Sync system troubleshooting
- **[DOCUMENTATION_HOSTING_OPTIONS.md](./DOCUMENTATION_HOSTING_OPTIONS.md)** - Documentation deployment options

### SDK Documentation
- **[packages/README.md](./packages/README.md)** - SDK development status and local usage

---

## 🔒 Internal Documentation (Gitignored)

These files are specific to your instance and won't be in the public repo:

- `CONSISTENCY_AUDIT_SUMMARY.md` - Repository audit findings
- `FIXES_APPLIED.md` - Changelog of fixes applied to your instance
- `QUICK_FIX_SUMMARY.md` - Recent quick fixes log
- `ENV_SETUP_TROUBLESHOOTING.md` - Environment setup help (instance-specific)
- `PERIODIC_SYNC_SETUP.md` - Your periodic sync configuration
- `src/app.js.README.md` - Deprecation notice for removed file
- `src/app.js.deprecated` - Backup of deprecated entry point

---

## 📖 Documentation by Use Case

### I want to...

**...install and run Cairo for the first time**
1. [README.md](./README.md) → Quick Start section
2. [SETUP_GUIDE.md](./SETUP_GUIDE.md) → Detailed setup
3. [DATABASE_SCHEMA_GUIDE.md](./DATABASE_SCHEMA_GUIDE.md) → Database setup

**...integrate Cairo into my app**
1. [SDK_QUICK_START.md](./SDK_QUICK_START.md) → SDK integration
2. [README.md](./README.md) → API Documentation section

**...use the Cairo dashboard (non-technical)**
1. [USER_GUIDE.md](./USER_GUIDE.md) → Complete dashboard guide

**...contribute to Cairo**
1. [CONTRIBUTING.md](./CONTRIBUTING.md) → Contribution guidelines
2. [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) → Community standards
3. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) → What needs work

**...troubleshoot sync issues**
1. [PERIODIC_SYNC_TROUBLESHOOTING.md](./PERIODIC_SYNC_TROUBLESHOOTING.md) → Sync debugging
2. [DATABASE_SCHEMA_GUIDE.md](./DATABASE_SCHEMA_GUIDE.md) → Schema issues
3. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) → Known sync bugs

**...understand the database schema**
1. [DATABASE_SCHEMA_GUIDE.md](./DATABASE_SCHEMA_GUIDE.md) → Complete schema reference
2. [README.md](./README.md) → Multi-tenant namespace system

**...deploy Cairo to production**
1. [README.md](./README.md) → Deployment section
2. [SETUP_GUIDE.md](./SETUP_GUIDE.md) → Production configuration
3. [DEPENDENCY_UPDATES.md](./DEPENDENCY_UPDATES.md) → Security updates

**...update dependencies**
1. [DEPENDENCY_UPDATES.md](./DEPENDENCY_UPDATES.md) → Update strategy and testing

**...see what's coming next**
1. [CAIRO_CDP_ROADMAP.md](./CAIRO_CDP_ROADMAP.md) → Feature roadmap
2. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) → Planned improvements

---

## 🗂️ Documentation Structure

```
cairo/
├── README.md                              # Main documentation (start here!)
├── SETUP_GUIDE.md                         # Detailed setup instructions
├── USER_GUIDE.md                          # Dashboard user guide
├── SDK_QUICK_START.md                     # SDK integration (5-min)
├── CONTRIBUTING.md                        # How to contribute
├── CODE_OF_CONDUCT.md                     # Community guidelines
├── CAIRO_CDP_ROADMAP.md                   # Product roadmap
├── DATABASE_SCHEMA_GUIDE.md               # Database reference
├── KNOWN_ISSUES.md                        # Technical debt tracker
├── DEPENDENCY_UPDATES.md                  # Dependency management
├── PERIODIC_SYNC_TROUBLESHOOTING.md       # Sync debugging
├── DOCUMENTATION_HOSTING_OPTIONS.md       # Doc deployment options
└── packages/
    └── README.md                          # SDK development guide
```

---

## 📝 Documentation Standards

When adding new documentation:

1. **Public docs** → Add to root directory, update this index
2. **Internal docs** → Add to `.gitignore`, document in "Internal" section above
3. **Technical guides** → Use clear headings, code examples, troubleshooting sections
4. **User guides** → Use simple language, screenshots, step-by-step instructions
5. **API docs** → Update README.md API Documentation section

---

## 🔄 Keeping Docs Updated

### When to update documentation:

- **New feature added** → Update README.md and relevant guides
- **API endpoint changed** → Update README.md API Documentation
- **Bug fixed** → Update KNOWN_ISSUES.md to mark as resolved
- **Dependency updated** → Update DEPENDENCY_UPDATES.md
- **Database schema changed** → Update DATABASE_SCHEMA_GUIDE.md
- **Breaking change** → Update all affected docs + add migration guide

### Documentation review schedule:

- **Weekly** → Review and update KNOWN_ISSUES.md
- **Monthly** → Review all docs for accuracy
- **Per release** → Update README.md, ROADMAP.md, KNOWN_ISSUES.md
- **Per major version** → Full documentation audit

---

## 🆘 Need Help?

- **Can't find what you need?** → Check README.md Table of Contents
- **Documentation unclear?** → [Open an issue](https://github.com/outcome-driven-studio/cairo/issues)
- **Want to improve docs?** → See [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Found a bug in docs?** → Submit a PR or open an issue

---

## 📊 Documentation Coverage

| Topic | Coverage | Last Updated |
|-------|----------|--------------|
| Installation & Setup | ✅ Complete | 2025-10-25 |
| API Reference | ✅ Complete | 2025-10-25 |
| Database Schema | ✅ Complete | 2025-10-25 |
| SDK Integration | ⚠️ Partial | SDKs not published |
| User Guide | ✅ Complete | 2025-09-28 |
| Troubleshooting | ✅ Complete | 2025-10-25 |
| Contributing | ✅ Complete | 2025-08-26 |
| Deployment | ✅ Complete | 2025-09-28 |
| Testing | ❌ Missing | Tests not implemented |

---

**Last updated:** October 25, 2025
