# Security policy

## Supported versions

The latest `1.x` release (`v1` tag on the Marketplace, latest on npm).

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository (Security tab → Report a vulnerability). You will get an acknowledgement within 72 hours. Please do not open a public issue for security problems.

## In scope

- Anything that lets a pull request execute code in the `pull_request_target` workflow, read the `github-token`, or reach the `openai-api-key`.
- Ways for pull request content to alter the Codex triage sandbox or escape schema validation.
- Comment or label writes to pull requests the policy says to skip.

## Out of scope

- False positives or negatives in detection (open a normal issue with the `false-positive.yml` template).
