#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const ALLOWED_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'test',
  'docs',
  'build',
  'ci',
  'chore',
  'revert',
];

const HEADER_MAX_LENGTH = 72;
const CONVENTIONAL_HEADER_PATTERN =
  /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9/-]*)\))?(?<breaking>!)?: (?<subject>.+)$/;
const CHANGE_BULLET_PATTERN = /^- [A-Z0-9].+/;

function printHelp(header, reason) {
  console.error(`\nInvalid commit message: ${reason}`);
  console.error(`Received: "${header}"\n`);
  console.error('Expected Conventional Commit format:');
  console.error('  type(scope): subject');
  console.error('  type: subject');
  console.error('\nRequired body format:');
  console.error('  Changes:');
  console.error('  - Summary of the first change');
  console.error('  - Summary of the second change');
  console.error('\nRecommended examples:');
  console.error('  feat(uploads): add async extraction retry');
  console.error('  ');
  console.error('  Changes:');
  console.error('  - Add async Docling submit and poll flow');
  console.error('  - Show clearer extraction status in Transfers');
  console.error('\nAllowed types:');
  console.error(`  ${ALLOWED_TYPES.join(', ')}`);
  console.error('\nRules:');
  console.error(`  - header must be ${HEADER_MAX_LENGTH} characters or fewer`);
  console.error('  - subject starts with a lowercase letter');
  console.error('  - no trailing period in the header');
  console.error('  - include a "Changes:" section in the body');
  console.error('  - include at least one human-readable bullet under "Changes:"');
}

function validateHeader(header) {
  if (header.length === 0) {
    return 'commit message header is empty';
  }

  if (
    header.startsWith('Merge ')
    || header.startsWith('Revert "')
    || header.startsWith('fixup!')
    || header.startsWith('squash!')
  ) {
    return null;
  }

  if (header.length > HEADER_MAX_LENGTH) {
    return `header is too long (${header.length}/${HEADER_MAX_LENGTH})`;
  }

  if (header.endsWith('.')) {
    return 'header must not end with a period';
  }

  const match = header.match(CONVENTIONAL_HEADER_PATTERN);

  if (!match?.groups) {
    return 'header does not match "type(scope): subject"';
  }

  const { type, subject } = match.groups;

  if (!ALLOWED_TYPES.includes(type)) {
    return `type "${type}" is not allowed`;
  }

  if (!/^[a-z]/.test(subject)) {
    return 'subject should start with a lowercase letter';
  }

  return null;
}

function findFirstContentLine(lines) {
  return lines.findIndex(line => line.length > 0 && !line.startsWith('#'));
}

function validateChangesSection(lines, header) {
  if (
    header.startsWith('Merge ')
    || header.startsWith('Revert "')
    || header.startsWith('fixup!')
    || header.startsWith('squash!')
  ) {
    return null;
  }

  const contentLines = lines
    .map(line => line.trimEnd())
    .filter(line => !line.startsWith('#'));

  const firstContentIndex = findFirstContentLine(contentLines);
  const bodyLines = firstContentIndex === -1 ? [] : contentLines.slice(firstContentIndex + 1);

  const changesIndex = bodyLines.findIndex(line => line.trim() === 'Changes:');

  if (changesIndex === -1) {
    return 'missing required "Changes:" section';
  }

  const bulletLines = [];

  for (const line of bodyLines.slice(changesIndex + 1)) {
    if (line.trim().length === 0) {
      if (bulletLines.length > 0) {
        break;
      }
      continue;
    }

    if (CHANGE_BULLET_PATTERN.test(line)) {
      bulletLines.push(line);
      continue;
    }

    if (bulletLines.length === 0) {
      return 'the "Changes:" section must be followed by bullet points';
    }

    break;
  }

  if (bulletLines.length === 0) {
    return 'the "Changes:" section must include at least one bullet point';
  }

  return null;
}

function main() {
  const commitMessagePath = process.argv[2];

  if (!commitMessagePath) {
    console.error('Usage: node scripts/validate-commit-message.mjs <commit-message-file>');
    process.exit(1);
  }

  const content = readFileSync(commitMessagePath, 'utf8');
  const lines = content.split('\n');
  const header = lines
    .map(line => line.trimEnd())
    .find(line => line.length > 0 && !line.startsWith('#'))
    ?? '';

  const validationError = validateHeader(header) ?? validateChangesSection(lines, header);

  if (validationError !== null) {
    printHelp(header, validationError);
    process.exit(1);
  }
}

main();
