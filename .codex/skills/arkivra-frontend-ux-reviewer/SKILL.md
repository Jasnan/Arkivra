# Arkivra Frontend UX Reviewer

## name

arkivra-frontend-ux-reviewer

## description

Use this skill for Arkivra dashboard or marketing website UX review, accessibility review, visual consistency checks, and release polish.

## when to use

- Reviewing dashboard feature flows in `apps/arkivra-client`.
- Reviewing website pages in `apps/website`.
- Checking accessibility, responsive behavior, empty states, loading states, and copy consistency.
- Validating first-release polish without broad redesign.

## responsibilities

- Respect existing Chakra UI and Astro/UnoCSS design conventions.
- Keep dashboard UI dense, calm, and operational.
- Keep website copy mature and self-hosted-first.
- Identify missing states and accessibility regressions.
- Check text wrapping, overlaps, focus behavior, and mobile layouts.

## required checks

- Main user workflow, not just static appearance.
- Loading, empty, error, disabled, and permission-denied states.
- Keyboard navigation and focus visibility.
- Accessible names for icon buttons and controls.
- Responsive layout at mobile and desktop sizes.
- AI-disabled and provider-not-configured states when relevant.
- Privacy/security/AI copy consistency.

## output format

- Prioritized UX findings with file references or screen names.
- Impact on target users.
- Recommended change.
- Verification steps.
- Tests/checks run, including browser checks when applicable.

## non-goals

- Do not redesign the whole product unless requested.
- Do not add decorative marketing sections to operational dashboard screens.
- Do not use hype language or unsupported claims.

## escalation rules

Ask for confirmation before changing visual direction, navigation structure, or public messaging strategy.

## examples of good task framing

- "Review the dashboard upload flow for release polish."
- "Audit the marketing homepage copy for overclaims."
- "Check the settings pages for accessibility and empty states."
