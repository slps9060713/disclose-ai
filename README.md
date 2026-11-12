# disclose-ai

> AI contribution policy as code. Detect AI-assisted pull requests, ask for disclosure the way your project wants it, and optionally let Codex do a structured first pass.

[![npm](https://img.shields.io/npm/v/disclose-ai)](https://www.npmjs.com/package/disclose-ai)
[![downloads](https://img.shields.io/npm/dm/disclose-ai)](https://www.npmjs.com/package/disclose-ai)
[![CI](https://github.com/slps9060713/disclose-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/slps9060713/disclose-ai/actions/workflows/ci.yml)
[![Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-disclose--ai-blue?logo=github)](https://github.com/marketplace/actions/disclose-ai)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[繁體中文](README.zh-TW.md)

Maintainers are drowning in AI-generated pull requests. Most projects answer with a paragraph in `CONTRIBUTING.md` that nobody reads. disclose-ai turns that paragraph into a two-minute install: declare your policy in one YAML file, and every pull request gets checked, labelled and, when needed, a friendly comment that says exactly what to add.

It asks for **disclosure**, not abstinence. As the ghostty maintainers put it: "It's the people, not the tools, that are the problem."

## What it does

- **Detects AI involvement** from five signals: co-author trailers (Claude, Codex, Copilot, Cursor, Devin, Gemini, Jules), agent branch prefixes (`codex/`, `claude/`, `copilot/`, `cursor/`, `devin/`, `cline/`, `aider/`, `gemini/`, `jules/`), bot authors, session-id trailers, and commit message patterns such as `(aider)` or "Generated with Claude Code".
- **Reads the disclosure** in the pull request description (tool and extent) and applies your policy: disclosure required always, only when detected, or never.
- **Leaves one comment** that is updated in place, listing the evidence and a copy-pasteable template, and syncs two labels: `ai-assisted` and `ai-undisclosed`.
- **Optionally triages with Codex**: `codex exec --output-schema` runs in a read-only sandbox and reports whether the description matches the diff, whether tests are included and how deep a human review should be.
- **Never approves, never merges, never checks out or executes the pull request's code.**

## Quick start

```bash
npx disclose-ai init --with-workflow
git add .github && git commit -m "ci: add disclose-ai"
```

That writes `.github/ai-policy.yml` (the `standard` template: comment and label, never block) and `.github/workflows/disclose-ai.yml`. To enable Codex triage, add an `OPENAI_API_KEY` repository secret. Nothing else to configure.

## Policy file

```yaml
# .github/ai-policy.yml
version: 1

disclosure:
  required: when-detected        # when-detected | always | never
  fields: [tool, extent]         # what the disclosure must state
  heading: "AI Disclosure"       # section title to look for in the PR description
  no_ai_phrase: "No AI tools were used"

detection:
  signals: [coauthor-trailer, branch-prefix, bot-author, session-trailer, commit-pattern]
  min_confidence: medium         # high | medium | low
  custom_patterns: []            # extra regexes matched against commit messages

enforcement:
  mode: comment+label            # comment+label | label-only | fail
  comment_on_pass: false
  labels: { assisted: ai-assisted, undisclosed: ai-undisclosed }
  exempt:
    users: []
    bots: ["dependabot[bot]", "renovate[bot]", "github-actions[bot]"]

review:
  codex:
    enabled: false
    model: ""                    # empty = Codex CLI default
    min_changed_lines: 20
    max_diff_kb: 200
    timeout_seconds: 180
```

Every key is optional except `version`. Three templates ship with the CLI:

| Template | Disclosure | Mode | Use when |
|---|---|---|---|
| `standard` (default) | when detected | comment + label | you want visibility without friction |
| `strict` | always, including "No AI tools were used" | fail | you want the ghostty model: every PR states its AI use |
| `light` | when detected | label only | you only want statistics |

`npx disclose-ai init --template strict --with-workflow`

## What contributors see

When a policy asks for disclosure and the description does not have it yet:

> ### 🤖 AI disclosure needed
> This repository asks contributors to disclose AI assistance. Signals suggest an AI coding tool was involved, and the pull request description does not yet include a complete disclosure. This is not a rejection.
>
> **What was detected**
> - `coauthor-trailer` (high, claude): commit a1a1a1a: Co-authored-by: Claude <noreply@anthropic.com>
>
> **What to do**
> - [ ] Add a "## AI Disclosure" section to the pull request description.
> - [ ] State the tool you used (for example Claude Code, Codex, Cursor, Copilot).
> - [ ] State the extent: what the tool produced, and what you reviewed, changed and tested yourself.
> - [ ] If no AI tools were involved, write "No AI tools were used" in that section instead.

The contributor edits the description, the workflow re-runs on `edited`, the same comment updates and the label flips to `ai-assisted`.

## Security model

disclose-ai runs on `pull_request_target` so it can comment on pull requests from forks. That event is only safe if the workflow never runs untrusted code, so:

- The generated workflow has **no `actions/checkout` step**. Pull request metadata, commits and the diff are read through the GitHub API as text.
- The action bundles its dependencies; nothing from the pull request is installed or executed.
- Codex triage runs in an **empty temporary directory** with a **read-only sandbox**, `--ignore-rules`, `--ignore-user-config` and `--ephemeral`, so a pull request cannot smuggle instructions through `AGENTS.md` or similar files. The diff is passed as untrusted text. Output is validated against a JSON schema and rendered as data.
- There is no code path that approves or merges.

This project's own dogfood workflow (`.github/workflows/disclose-ai.yml`) does run `actions/checkout` — that is safe specifically because it triggers on `pull_request_target`, whose default checkout is always the **base** branch, never the pull request's head, so it checks out this repository's own trusted code before running `uses: ./`. The workflow the CLI scaffolds for adopters (above) has no checkout step at all, because it runs the published action instead of a local checkout.

Found a problem? See [SECURITY.md](SECURITY.md).

## CLI

```bash
npx disclose-ai init [--template standard|strict|light] [--with-workflow] [--force]
npx disclose-ai validate [.github/ai-policy.yml]
npx disclose-ai check owner/repo#123          # dry run: prints what the action would do
npx disclose-ai check <pr-url> --apply --json # actually comment and label
```

`check` uses `--token`, then `GITHUB_TOKEN` or `GH_TOKEN`, then `gh auth token`. It runs the same detection, disclosure parsing and policy evaluation as the Action, but it never runs Codex triage — even when `review.codex.enabled` is `true` in the policy. If the Action's triage is enabled, its comment will include a "Automated first-pass triage by Codex" section that `check`'s output does not show.

## Action reference

| Input | Default | Purpose |
|---|---|---|
| `github-token` | `${{ github.token }}` | read the PR, write comments and labels |
| `policy-path` | `.github/ai-policy.yml` | policy file, read from the base branch |
| `mode` | from policy | override `enforcement.mode` |
| `codex-enabled` | from policy | override `review.codex.enabled` |
| `openai-api-key` | empty | enables Codex triage |
| `codex-model` | from policy | override the model |
| `dry-run` | `false` | evaluate and print only |

`mode`, `codex-enabled` and `codex-model` each default to an empty string in `action.yml` itself; an empty value means "don't override — defer to the policy file", which is what the table's "from policy" means in practice.

Outputs: `status` (`pass`, `needs-disclosure`, `skipped`, `invalid-policy`), `detected`, `signals` (JSON), `labels`.

## How it compares

- **A paragraph in CONTRIBUTING.md**: unenforced and invisible at review time. disclose-ai makes the policy show up on the pull request itself.
- **Co-author trailer detectors**: detection is one of five signals here, and detection alone does not tell a contributor what to do. disclose-ai parses the disclosure, applies a policy, syncs labels and can triage.
- **Full AI review bots**: disclose-ai is a gate plus triage, not a reviewer. It never leaves code review comments and never approves.

## Roadmap

- `disclose-ai log`: a contributor-side command that turns local Codex or Claude Code session logs into an "agent work log" for the pull request.
- Issue triage with the same signals and Codex schema.
- Organisation-level policies.

## Built with AI, and disclosed

This project is developed with AI coding tools. Its own pull requests are gated by disclose-ai with the `strict` template. Same-repository pull requests are also reviewed by `openai/codex-action`; fork pull requests skip that check, since forks receive no repository secrets on the `pull_request` event. See [`.github/ai-policy.yml`](.github/ai-policy.yml).

## License

MIT
