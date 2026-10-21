#!/usr/bin/env node
// Sets a new version in both plugin manifests and moves the [Unreleased]
// entries of CHANGELOG.md under that version. It commits and tags nothing.
// CONTRIBUTING.md, "Releasing", has the steps around it.
//
//   node scripts/release.mjs <major.minor.patch> [--date YYYY-MM-DD]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTS = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
let version;
let date = new Date().toISOString().slice(0, 10);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date') date = args[++i];
  else version = args[i];
}
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('usage: node scripts/release.mjs <major.minor.patch> [--date YYYY-MM-DD]');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) fail(`--date ${date} is not YYYY-MM-DD`);

const read = (path) => readFileSync(join(root, path), 'utf8');
// A line edit keeps each manifest's own formatting, which a JSON round trip would not
const VERSION_LINE = /^(\s*"version": ")([^"]+)(",?)$/m;
const manifests = MANIFESTS.map((path) => ({ path, text: read(path) }));
const current = manifests[0].text.match(VERSION_LINE)?.[2];
for (const { path, text } of manifests) {
  if (text.match(VERSION_LINE)?.[2] !== current) fail(`${path} does not hold version ${current}`);
}

const parts = (v) => v.split('.').map(Number);
const newer = parts(version).map((n, i) => n - parts(current)[i]).find((d) => d !== 0) > 0;
if (!newer) fail(`${version} is not newer than ${current}`);

const changelog = read('CHANGELOG.md');
const unreleased = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|^\[Unreleased\]:)/m);
if (!unreleased?.[1].trim()) fail('CHANGELOG.md has nothing under [Unreleased]');
if (!/^\[Unreleased\]: /m.test(changelog)) fail('CHANGELOG.md has no [Unreleased] link');

const repository = JSON.parse(manifests[0].text).repository;
const released = changelog
  .replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${version}] - ${date}\n`)
  .replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${repository}/compare/v${version}...HEAD\n[${version}]: ${repository}/releases/tag/v${version}`);

for (const { path, text } of manifests) writeFileSync(join(root, path), text.replace(VERSION_LINE, `$1${version}$3`));
writeFileSync(join(root, 'CHANGELOG.md'), released);
console.log(`${current} -> ${version}: set both manifests and dated the changelog ${date}`);
