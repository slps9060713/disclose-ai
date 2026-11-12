# Contributing

Thanks for helping. This project is small on purpose; most contributions are new detection patterns, false-positive fixes and documentation.

## Development

```bash
npm ci
npm test            # vitest
npm run lint        # biome
npm run typecheck
npm run build       # tsup -> dist/ (committed; CI checks it is up to date)
```

Write the failing test first. `signals`, `evaluate` and `report` are pure modules; the goal is full branch coverage on all three, though today only `report` is actually there (measured: `report` 100%, `signals` 95.6%, `evaluate` 91.2% — most of the gap is `noUncheckedIndexedAccess`-forced `?? ""` fallbacks after bounds-checked indexing or always-matching regex captures, which are statically unreachable). Run `npm run test:coverage` before opening a pull request and cover any new reachable branch you add.

## Adding a detection pattern

1. Add the identity, login or regex to `src/signals/patterns.ts`.
2. Add a fixture under `test/fixtures/prs/` that reproduces a real pull request (anonymise names and emails).
3. Add a test in the matching `test/signals/*.test.ts` and make sure `test/signals/index.test.ts` still passes.

## Pull requests

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`). release-please builds the changelog from them.
- Fill in the AI Disclosure section of the pull request template. This repository uses the `strict` policy: every pull request states which AI tools were used and to what extent, or says "No AI tools were used". The check will fail until it does.
- Run `npm run build` and commit `dist/` when you change `src/`.

## Releasing

Releases are automated once the one-time setup below is done:

1. Merging to `main` makes release-please open or update a "chore(main): release x.y.z" pull request.
2. Merging that pull request creates the tag and GitHub Release, publishes to npm through trusted publishing, and moves the floating `v<major>` tag.
3. To force a specific version, add a `Release-As: x.y.z` footer to a commit.

### One-time setup for a new fork of this project

Do these in order the first time this project is released from a fresh repository:

1. **Create the repository and push.** Create the GitHub repo (public, so the Action and npm package can be public too) and push `main`. Nothing below can run until this exists.
2. **Let Actions open pull requests.** Settings → Actions → General → Workflow permissions: check "Allow GitHub Actions to create and approve pull requests", which release-please needs to open its release PR. Leave the default token permission on "Read repository contents and packages permissions": every workflow here declares the exact permissions it needs, so that default never applies, and keeping it read-only means any workflow added later without a `permissions:` block gets the least privilege.
3. **Enable private vulnerability reporting.** Settings → Code security → turn on "Private vulnerability reporting". This is what [SECURITY.md](SECURITY.md) and the Code of Conduct point reporters to.
4. **Force the first release to be `1.0.0`, not `0.1.0`.** `release-please-config.json` has `bump-minor-pre-major: true`, so left to its own defaults, release-please would cut the *first* release as `0.1.0` and move the floating tag to `v0`. That would break every adopter's quick start on day one, because `disclose-ai init` scaffolds workflows that pin `uses: slps9060713/disclose-ai@v1` — a `v1` tag that would not exist yet. Before merging any release-please pull request, push an empty commit that pins the version:
   ```
   git commit --allow-empty -m "chore: release 1.0.0

   The action, CLI and Codex triage are complete and dogfooded.

   Release-As: 1.0.0"
   git push
   ```
5. **Merge the release PR.** release-please opens "chore(main): release 1.0.0" (driven by the `Release-As` trailer above, overriding `bump-minor-pre-major` for this one release). Merge it. The `Release` workflow tags `v1.0.0` and, in a job of its own, moves `v1` to point at it, so `@v1` works even though the `publish` job's npm step fails on this first run (next step).
6. **Hand-publish the first npm version.** The `publish` job's `npm publish` will fail on this first run — npm's Trusted Publisher (OIDC) binding can only be configured for a package name that already exists on npm, so the very first publish can't go through the automated, credential-less path. Break the chicken-and-egg problem manually: create an npmjs.com account if needed, then
   ```
   npm login
   git checkout v1.0.0
   npm ci && npm run build && npm publish --access public
   ```
7. **Configure npm Trusted Publisher.** On npmjs.com, open the `disclose-ai` package's Settings → Trusted Publisher, and add GitHub Actions with repository `slps9060713/disclose-ai` and workflow `release.yml`. From this point on, `publish` jobs authenticate via OIDC and every later release is fully automatic — steps 1-3 of "Releases are automated" above.
8. **List on the GitHub Marketplace.** Once `v1.0.0` exists: open the release, check "Publish this Action to the GitHub Marketplace", and pick categories such as "Code review" and "Utilities". Requires two-factor authentication on the account; `action.yml`'s `branding` and this `README.md` are already in place.
9. **Optionally switch the self-dogfood workflow to the published action.** `.github/workflows/disclose-ai.yml` currently runs `uses: ./` against a local checkout of the base branch (see the [security model](README.md#security-model)). Once `@v1` is live, it can be replaced with a single `uses: slps9060713/disclose-ai@v1` step, so this repository dogfoods the exact artifact adopters consume.
