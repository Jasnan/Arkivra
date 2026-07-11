import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(appRoot, 'dist');
const htmlFiles = [];
const leadingSlashPattern = /^\/+/;
const protocolPattern = /^[a-z][a-z\d+.-]*:/i;

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      visit(path);
    } else if (extname(path) === '.html') {
      htmlFiles.push(path);
    }
  }
}

function targetExists(pathname) {
  const decoded = decodeURIComponent(pathname).replace(leadingSlashPattern, '');
  if (decoded === '') {
    return existsSync(join(distRoot, 'index.html'));
  }
  return [
    join(distRoot, decoded),
    join(distRoot, decoded, 'index.html'),
    join(distRoot, `${decoded}.html`),
  ].some((path) => {
    return existsSync(path);
  });
}

visit(distRoot);
const failures = [];
const hrefPattern = /href=["']([^"']+)["']/g;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }
    if (protocolPattern.test(href) || href.startsWith('//')) {
      continue;
    }

    const url = new URL(href, 'https://docs.arkivra.app');
    if (!targetExists(url.pathname)) {
      failures.push(`${file}: ${href}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Found ${failures.length} broken internal link(s):\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files; no broken internal links found.`);
