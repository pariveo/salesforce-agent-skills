#!/usr/bin/env node
// Prints one version's section of CHANGELOG.md, without its heading, as the
// notes of that version's GitHub release. The release workflow runs it, and
// CONTRIBUTING.md, "Releasing", has the steps around it.
//
//   node scripts/release-notes.mjs <major.minor.patch>

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('usage: node scripts/release-notes.mjs <major.minor.patch>');

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\][^\\n]*\\n`, 'm');
const start = changelog.match(heading);
if (!start) fail(`CHANGELOG.md has no section for ${version}`);

const rest = changelog.slice(start.index + start[0].length);
const end = rest.search(/^## \[|^\[Unreleased\]:/m);
const notes = (end === -1 ? rest : rest.slice(0, end)).trim();
if (!notes) fail(`CHANGELOG.md has nothing under ${version}`);
process.stdout.write(`${notes}\n`);
