#!/usr/bin/env node
// Lists every source the plugin skills cite with the claims that cite it, plus
// the "Not verified" marks and the releases named, as a release review checklist.
// The official pages CONTRIBUTING.md cites for the maintainer scripts, and
// those the guides under docs/ cite, get groups of their own, so they aren't
// read as skill claims.
//
//   node scripts/source-inventory.mjs [--json]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(root, 'skills');
const OFFICIAL = new Set(['help.salesforce.com', 'developer.salesforce.com']);

// Every folder under skills/ with a SKILL.md, and its references and examples where they exist
const listed = (dir, keep = () => true) => (existsSync(dir) ? readdirSync(dir).filter(keep).sort().map((f) => join(dir, f)) : []);
const files = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(skillsRoot, d.name, 'SKILL.md')))
  .map((d) => join(skillsRoot, d.name))
  .sort()
  .flatMap((skillDir) => [
    join(skillDir, 'SKILL.md'),
    ...listed(join(skillDir, 'references'), (f) => f.endsWith('.md')),
    ...listed(join(skillDir, 'examples', 'flows')),
  ]);

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

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![(\w])(https?:\/\/[^\s)>"']+)/g;
function cites(source, path) {
  const lines = source.split('\n');
  return [...source.matchAll(LINK)].map((match) => {
    const url = (match[2] ?? match[3]).replace(/[.,;]+$/, '');
    const line = source.slice(0, match.index).split('\n').length;
    const text = match[1]?.replace(/\s+/g, ' ') ?? null;
    return { url, host: new URL(url).hostname, file: path, line, text, claim: block(lines, line - 1, text ? `[${text}]` : url) };
  });
}

const citations = [];
const unverified = [];
const releases = new Map();
const apis = new Map();

for (const file of files) {
  const path = relative(skillsRoot, file);
  let source = readFileSync(file, 'utf8');
  // Example flows: only the header comment is prose
  if (file.endsWith('.xml')) source = source.match(/<!--([\s\S]*?)-->/)?.[1] ?? '';
  const lines = source.split('\n');
  citations.push(...cites(source, path));
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

// CONTRIBUTING.md's other links are conventions and the licence, not platform claims
const maintainerCitations = cites(readFileSync(join(root, 'CONTRIBUTING.md'), 'utf8'), 'CONTRIBUTING.md').filter((c) => OFFICIAL.has(c.host));

const guideCitations = listed(join(root, 'docs'), (f) => f.endsWith('.md'))
  .flatMap((file) => cites(readFileSync(file, 'utf8'), relative(root, file)))
  .filter((c) => OFFICIAL.has(c.host));

function bySource(list) {
  const sources = new Map();
  for (const c of list) sources.set(c.url, [...(sources.get(c.url) ?? []), c]);
  return [...sources].map(([url, cites]) => ({ url, official: OFFICIAL.has(cites[0].host), citations: cites.map(({ url: _, host: __, ...c }) => c) }));
}
const baseline = JSON.parse(readFileSync(join(root, 'maintenance', 'release.json'), 'utf8'));
// Winter 'NN ships before Spring 'NN and Summer 'NN
const releaseOrder = (r) => {
  const [, season, year] = r.match(/(\w+) '(\d\d)/);
  return Number(year) * 3 + { Winter: 0, Spring: 1, Summer: 2 }[season];
};

const result = {
  baseline,
  sources: bySource(citations),
  maintainerSources: bySource(maintainerCitations),
  guideSources: bySource(guideCitations),
  unverified,
  releases: Object.fromEntries([...releases].sort(([a], [b]) => releaseOrder(a) - releaseOrder(b))),
  apiVersions: Object.fromEntries([...apis].sort(([a], [b]) => a - b)),
};

// No process.exit after the JSON: it would cut piped output off at 64 KB.
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else console.log(report().join('\n'));

function report() {
  const official = result.sources.filter((s) => s.official);
  const other = result.sources.filter((s) => !s.official);
  const out = [
    '# Source inventory',
    '',
    `Baseline: ${baseline.release} (API ${baseline.apiVersion}.0), reviewed ${baseline.reviewedOn}.`,
    `${official.length} official sources, ${citations.length} citations, ${unverified.length} "Not verified" marks.`,
    `${result.maintainerSources.length} official sources for the maintainer scripts, ${maintainerCitations.length} citations.`,
    `${result.guideSources.length} official sources for the guides under docs/, ${guideCitations.length} citations.`,
    'Skill paths are relative to skills/.',
    '',
    '## Official sources',
    '',
    'Open each page once. Tick it when every claim below it still matches the page.',
    '',
  ];
  const cite = (c) => `  - ${c.file}:${c.line}${c.text ? ` [${c.text}]` : ''}: ${c.claim}`;
  for (const s of official) out.push(`- [ ] ${s.url}`, ...s.citations.map(cite));
  out.push(
    '',
    '## Maintainer script sources',
    '',
    'Cited in CONTRIBUTING.md at the repository root, for the maintainer scripts. These back no skill claim. Tick each page when the command next to it still behaves as the page says.',
    '',
  );
  if (!result.maintainerSources.length) out.push('None.');
  for (const s of result.maintainerSources) out.push(`- [ ] ${s.url}`, ...s.citations.map(cite));
  out.push(
    '',
    '## Guide sources',
    '',
    'Cited in the guides under docs/ for the commands they give. These back no skill claim. Tick each page when the command next to it still runs as the guide says.',
    '',
  );
  if (!result.guideSources.length) out.push('None.');
  for (const s of result.guideSources) out.push(`- [ ] ${s.url}`, ...s.citations.map(cite));
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
  return out;
}
