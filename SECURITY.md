# Security Policy

## Supported versions

Security fixes are applied on the latest `main` branch. Self-hosters should stay current with `main` (or tagged releases when published).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email the maintainers via the contact listed on the [GitHub organization](https://github.com/outcome-driven-studio) or open a **private** security advisory on the repository if available.

Include:

- Description and impact
- Steps to reproduce
- Affected commit / version if known

We will acknowledge receipt and work on a fix before any public disclosure.

## Hardening checklist (self-host)

- Set `NODE_ENV=production` or `CAIRO_REQUIRE_WRITE_KEYS=true` (disable bootstrap / open ingest)
- Rotate write keys; never commit `.env` / secrets
- Put TLS in front of Cairo and any relay
- Optionally set `CAIRO_WEBHOOK_SECRET` and matching `HOOK_SECRET` on relays
- Restrict who can call MCP tools that mint keys or delete user data
