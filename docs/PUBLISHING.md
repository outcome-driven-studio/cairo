# Publishing @cairo packages

## One-time setup (you)

1. Create an npm org named **`cairo`**: https://www.npmjs.com/org/create  
   (Scoped packages `@cairo/*` require this org, or a user named `cairo`.)
2. Create an **Automation** access token: https://www.npmjs.com/settings/~/tokens  
   - Type: Automation  
   - Grant publish access to the `cairo` org
3. Add the token as a GitHub Actions secret named **`NPM_TOKEN`** on `outcome-driven-studio/cairo`  
   Or export it locally: `export NPM_TOKEN=npm_...`

Root package is **not** published as `cairo` (that name is taken on npm by an unrelated package). Server distribution = git + Docker.

## Publish (local)

```bash
export NPM_TOKEN=npm_...   # or: npm login
chmod +x scripts/publish-packages.sh
./scripts/publish-packages.sh

# dry run:
DRY_RUN=true ./scripts/publish-packages.sh
```

## Publish (GitHub Actions)

Actions → **Publish npm packages** → Run workflow.

Or create a GitHub Release; the workflow also runs on `release: published`.

## After publish

`npm install @cairo/tracker` and `npx -y @cairo/agent-mcp` should work. Update the root README if needed (remove “not published yet” notes).
