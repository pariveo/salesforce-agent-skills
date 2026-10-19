#!/usr/bin/env node
// Lists every source the skill cites with the claims that cite it, plus the
// "Not verified" marks and the releases named, as a release review checklist.
//
//   node scripts/source-inventory.mjs [--json]

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(root, 'skills', 'salesforce-flow-modernizer');
const OFFICIAL = new Set(['help.salesforce.com', 'developer.salesforce.com']);

const files = [
  join(skillDir, 'SKILL.md'),
  ...readdirSync(join(skillDir, 'references')).filter((f) => f.endsWith('.md')).sort().map((f) => join(skillDir, 'references', f)),
  ...readdirSync(join(skillDir, 'examples', 'flows')).sort().map((f) => join(skillDir, 'examples', 'flows', f)),
];

const START = /^\s*(?:[-*] |\d+\. |\||#|```)/;
// The paragraph, list item or table row around a line, cut to 280 characters around `needle`
function block(lines, index, needle) {
  let first = index;
  while (first > 0 && lines[first - 1].trim() && !START.test(lines[first]) && !lines[first - 1].trim().startsWith('|')) first--;
  let last = index;
  while (last + 1 < lines.length && lines[last + 1].trim() && !START.test(lines[last + 1])) last++;
  const text = lines.slice(first, last + 1).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= 280) return text;
  const at = Math.max(0, needle ? text.indexOf(needle) : 0);
  const from = Math.max(0, at - 100);
  const to = Math.min(text.length, from + 280);
  return `${from > 0 ? '...' : ''}${text.slice(from, to)}${to < text.length ? '...' : ''}`;
}

const citations = [];
const unverified = [];
const releases = new Map();
const apis = new Map();

for (const file of files) {
  const path = relative(skillDir, file);
  let source = readFileSync(file, 'utf8');
  // Example flows: only the header comment is prose
  if (file.endsWith('.xml')) source = source.match(/<!--([\s\S]*?)-->/)?.[1] ?? '';
  const lines = source.split('\n');
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;

  for (const match of source.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![(\w])(https?:\/\/[^\s)>"']+)/g)) {
    const url = (match[2] ?? match[3]).replace(/[.,;]+$/, '');
    const line = lineOf(match.index);
    const text = match[1]?.replace(/\s+/g, ' ') ?? null;
    citations.push({ url, host: new URL(url).hostname, file: path, line, text, claim: block(lines, line - 1, text ? `[${text}]` : url) });
  }
  lines.forEach((text, i) => {
    if (/\bNot verified\b/.test(text)) unverified.push({ file: path, line: i + 1, claim: block(lines, i, 'Not verified') });
    for (const [release] of text.matchAll(/\b(?:Spring|Summer|Winter) '\d\d\b/g)) {
      releases.set(release, [...(releases.get(release) ?? []), `${path}:${i + 1}`]);
    }
    for (const [, version] of text.matchAll(/\bAPI (?:version )?(\d{2})(?:\.0)?\b/g)) {
      apis.set(Number(version), [...(apis.get(Number(version)) ?? []), `${path}:${i + 1}`]);
    }
  });
}

const sources = new Map();
for (const c of citations) sources.set(c.url, [...(sources.get(c.url) ?? []), c]);
const baseline = JSON.parse(readFileSync(join(root, 'maintenance', 'release.json'), 'utf8'));
// Winter 'NN ships before Spring 'NN and Summer 'NN
const releaseOrder = (r) => {
  const [, season, year] = r.match(/(\w+) '(\d\d)/);
  return Number(year) * 3 + { Winter: 0, Spring: 1, Summer: 2 }[season];
};

const result = {
  baseline,
  sources: [...sources].map(([url, cites]) => ({ url, official: OFFICIAL.has(cites[0].host), citations: cites.map(({ url: _, host: __, ...c }) => c) })),
  unverified,
  releases: Object.fromEntries([...releases].sort(([a], [b]) => releaseOrder(a) - releaseOrder(b))),
  apiVersions: Object.fromEntries([...apis].sort(([a], [b]) => a - b)),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const official = result.sources.filter((s) => s.official);
const other = result.sources.filter((s) => !s.official);
const out = [
  '# Source inventory',
  '',
  `Baseline: ${baseline.release} (API ${baseline.apiVersion}.0), reviewed ${baseline.reviewedOn}.`,
  `${official.length} official sources, ${citations.length} citations, ${unverified.length} "Not verified" marks.`,
  'Paths are relative to skills/salesforce-flow-modernizer/.',
  '',
  '## Official sources',
  '',
  'Open each page once. Tick it when every claim below it still matches the page.',
  '',
];
const cite = (c) => `  - ${c.file}:${c.line}${c.text ? ` [${c.text}]` : ''}: ${c.claim}`;
for (const s of official) out.push(`- [ ] ${s.url}`, ...s.citations.map(cite));
out.push('', '## Other hosts', '', 'Not on help.salesforce.com or developer.salesforce.com. Keep only if no official page states the claim.', '');
if (!other.length) out.push('None.');
for (const s of other) out.push(`- [ ] ${s.url}`, ...s.citations.map(cite));
out.push('', '## Marked "Not verified"', '', 'Check whether an official page now states each of these.', '');
if (!unverified.length) out.push('None.');
for (const u of unverified) out.push(`- [ ] ${u.file}:${u.line}: ${u.claim}`);
out.push('', '## Releases named', '');
for (const [release, at] of Object.entries(result.releases)) out.push(`- ${release}: ${at.length} (${at.join(', ')})`);
out.push('', '## API versions named', '');
for (const [version, at] of Object.entries(result.apiVersions)) out.push(`- ${version}.0: ${at.length} (${at.join(', ')})`);
console.log(out.join('\n'));
