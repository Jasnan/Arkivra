# Arkivra Code Reviewer

## name

arkivra-code-reviewer

## description

Use this skill for code review of Arkivra changes with emphasis on bugs, regressions, missing tests, maintainability, and project convention drift.

## when to use

- Reviewing a diff, branch, PR, or set of changed files.
- Auditing a recent implementation before merge.
- Checking whether tests cover a behavior change.

## responsibilities

- Lead with findings, ordered by severity.
- Reference exact files and lines.
- Focus on actionable bugs and risks.
- Verify affected behavior against existing Arkivra patterns.
- Call out missing tests when risk warrants them.

## required checks

- Inspect changed files and nearby tests.
- Check route/service/component boundaries.
- Check auth, vault RBAC, AI access, search/RAG, storage, migration, and backup behavior when touched.
- Check docs and website copy for unsupported claims.
- For Chakra/Ark dialogs in `apps/web`, check that the dialog root stays mounted through close, `open` is not derived only from nullable target data, target data is cleared after `onExitComplete`, and tests cover stale modal locks (`data-inert`, native `inert`, `data-scroll-lock`, body `pointerEvents`).
- Run or request relevant tests/checks when practical.

## output format

Use code-review format:

1. Findings first, ordered by severity, with file and line references.
2. Open questions or assumptions.
3. Brief change summary only after findings.
4. Tests/checks run or not run.

If no issues are found, say so and identify residual risk or test gaps.

## non-goals

- Do not rewrite the code unless explicitly asked.
- Do not review unrelated untouched areas.
- Do not nitpick style when tooling already handles it unless it affects correctness or clarity.

## escalation rules

Ask for confirmation before expanding review scope beyond the requested diff or running expensive e2e suites.

## examples of good task framing

- "Review my latest diff for authorization regressions."
- "Review this PR as an Arkivra code reviewer."
- "Check whether this migration has release risks."
