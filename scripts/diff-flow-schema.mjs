#!/usr/bin/env node
// Diffs the Flow types of a Metadata WSDL against the checker's tag lists and
// against the newest snapshot in maintenance/flow-schema/ below --api. The
// WSDL comes from an org on the release under review (Setup, API, Generate
// Metadata WSDL).
//
//   node scripts/diff-flow-schema.mjs <metadata.wsdl | snapshot.json> [--api <n>] [--against <snapshot.json>] [--write] [--json] [--snapshot]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDir = join(root, 'maintenance', 'flow-schema');
const checkerPath = join(root, 'skills', 'salesforce-flow-modernizer', 'scripts', 'check-flow.mjs');

const local = (qname) => qname.replace(/^[\w.-]+:/, '');
const attrs = (source) => Object.fromEntries([...source.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map(([, k, v]) => [k, v]));

function parseWsdl(source) {
  const complex = new Map();
  for (const [, , name, body] of source.matchAll(/<(\w+:)?complexType\s+name="([^"]+)"\s*>([\s\S]*?)<\/\1complexType>/g)) {
    const base = body.match(/<(?:\w+:)?extension\s+base="([^"]+)"/)?.[1];
    const fields = {};
    for (const [, raw] of body.matchAll(/<(?:\w+:)?element\s+([^>]*?)\/?>/g)) {
      const a = attrs(raw);
      if (a.name) fields[a.name] = `${local(a.type ?? 'anyType')}${a.maxOccurs === 'unbounded' ? '[]' : ''}`;
    }
    complex.set(name, { base: base ? local(base) : null, fields });
  }
  const simple = new Map();
  for (const [, , name, body] of source.matchAll(/<(\w+:)?simpleType\s+name="([^"]+)"\s*>([\s\S]*?)<\/\1simpleType>/g)) {
    simple.set(name, [...body.matchAll(/<(?:\w+:)?enumeration\s+value="([^"]*)"/g)].map(([, v]) => v));
  }

  // Keep base types too, so inherited fields such as Metadata.fullName resolve
  const keep = new Set([...complex.keys()].filter((name) => name.startsWith('Flow')));
  for (const name of [...keep]) {
    for (let base = complex.get(name).base; base && complex.has(base) && !keep.has(base); base = complex.get(base).base) keep.add(base);
  }
  const types = {};
  for (const name of [...keep].sort()) types[name] = { base: complex.get(name).base, fields: sortKeys(complex.get(name).fields) };
  const referenced = new Set(Object.values(types).flatMap((t) => Object.values(t.fields).map((f) => f.replace('[]', ''))));
  const enums = {};
  for (const name of [...referenced].filter((n) => simple.has(n)).sort()) enums[name] = [...simple.get(name)].sort();
  return { types, enums };
}

const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

function allFields(schema, name) {
  const fields = [];
  for (let type = schema.types[name]; type; type = schema.types[type.base]) fields.push(...Object.keys(type.fields));
  return fields;
}

function snapshots() {
  if (!existsSync(snapshotDir)) return [];
  return readdirSync(snapshotDir)
    .map((f) => f.match(/^(\d+)(?:\.0)?\.json$/))
    .filter(Boolean)
    .map(([file, api]) => ({ file: join(snapshotDir, file), api: Number(api) }))
    .sort((a, b) => a.api - b.api);
}

// Parsed from source, because importing the checker would run its CLI
function checkerLists() {
  const source = readFileSync(checkerPath, 'utf8');
  const list = (name) => {
    const body = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))?.[1] ?? '';
    return [...body.matchAll(/'([^']+)'/g)].map(([, v]) => v).sort();
  };
  return { FLOW_FIELDS: list('FLOW_FIELDS'), VALUE_FIELDS: list('VALUE_FIELDS') };
}

function diff(from, to) {
  const names = (o) => Object.keys(o ?? {});
  const types = {
    added: names(to.types).filter((n) => !from.types[n]),
    removed: names(from.types).filter((n) => !to.types[n]),
    changed: {},
  };
  for (const name of names(to.types).filter((n) => from.types[n])) {
    const a = from.types[name];
    const b = to.types[name];
    const change = {
      added: names(b.fields).filter((f) => !(f in a.fields)).map((f) => `${f}: ${b.fields[f]}`),
      removed: names(a.fields).filter((f) => !(f in b.fields)),
      retyped: names(b.fields).filter((f) => f in a.fields && a.fields[f] !== b.fields[f]).map((f) => `${f}: ${a.fields[f]} -> ${b.fields[f]}`),
    };
    if (a.base !== b.base) change.base = `${a.base} -> ${b.base}`;
    if (change.added.length || change.removed.length || change.retyped.length || change.base) types.changed[name] = change;
  }
  const enums = { added: names(to.enums).filter((n) => !from.enums[n]), removed: names(from.enums).filter((n) => !to.enums[n]), changed: {} };
  for (const name of names(to.enums).filter((n) => from.enums[n])) {
    const added = to.enums[name].filter((v) => !from.enums[name].includes(v));
    const removed = from.enums[name].filter((v) => !to.enums[name].includes(v));
    if (added.length || removed.length) enums.changed[name] = { added, removed };
  }
  return { types, enums };
}

function checkerDrift(schema) {
  const lists = checkerLists();
  const drift = {};
  for (const [list, type] of [['FLOW_FIELDS', 'Flow'], ['VALUE_FIELDS', 'FlowElementReferenceOrValue']]) {
    const fields = allFields(schema, type);
    if (!fields.length) continue;
    const notInChecker = fields.filter((f) => !lists[list].includes(f));
    const notInSchema = lists[list].filter((f) => !fields.includes(f));
    if (notInChecker.length || notInSchema.length) drift[list] = { type, notInChecker, notInSchema };
  }
  return drift;
}

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const valued = new Set(['--api', '--against']);
const input = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!input) {
  console.error('usage: node scripts/diff-flow-schema.mjs <metadata.wsdl | snapshot.json> [--api <n>] [--against <snapshot.json>] [--write] [--json] [--snapshot]');
  process.exit(2);
}

const loaded = input.endsWith('.json') ? JSON.parse(readFileSync(input, 'utf8')) : parseWsdl(readFileSync(input, 'utf8'));
const api = Number(option('--api') ?? loaded.apiVersion) || undefined;
const current = { apiVersion: api ?? null, types: loaded.types, enums: loaded.enums };
if (!Object.keys(current.types).length) {
  console.error(`${input}: no complex types named Flow* found. Is this the Metadata WSDL?`);
  process.exit(2);
}

if (args.includes('--snapshot')) {
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

let baselineLabel;
let baseline;
const against = option('--against');
if (against) {
  baseline = JSON.parse(readFileSync(against, 'utf8'));
  baselineLabel = against;
} else {
  const candidate = snapshots().filter((s) => !api || s.api < api).pop();
  if (candidate) {
    baseline = JSON.parse(readFileSync(candidate.file, 'utf8'));
    baselineLabel = `maintenance/flow-schema/${candidate.api}.json`;
  }
}

const result = {
  input,
  apiVersion: api ?? null,
  baseline: baselineLabel ?? null,
  schema: baseline ? diff(baseline, current) : null,
  checkerDrift: checkerDrift(current),
};

if (args.includes('--write')) {
  if (!api) {
    console.error('--write needs --api <version>, the org API version the WSDL came from');
    process.exit(2);
  }
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(join(snapshotDir, `${api}.json`), `${JSON.stringify(current, null, 2)}\n`);
  result.written = `maintenance/flow-schema/${api}.json`;
}

if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const out = [];
const list = (label, items) => out.push(`  ${label}: ${items.length ? items.join(', ') : 'none'}`);
out.push(`Flow schema: ${input}${api ? ` (API ${api}.0)` : ''}`);
if (!result.schema) {
  out.push('No baseline snapshot, so there is no schema diff. Save this one with --write --api <n> to start one.');
} else {
  out.push(`Against: ${baselineLabel}`, '', 'Types');
  list('added', result.schema.types.added);
  list('removed', result.schema.types.removed);
  for (const [name, c] of Object.entries(result.schema.types.changed)) {
    out.push(`  ${name}`);
    if (c.base) out.push(`    base ${c.base}`);
    for (const f of c.added) out.push(`    + ${f}`);
    for (const f of c.removed) out.push(`    - ${f}`);
    for (const f of c.retyped) out.push(`    ~ ${f}`);
  }
  out.push('', 'Enumerations');
  list('added', result.schema.enums.added);
  list('removed', result.schema.enums.removed);
  for (const [name, c] of Object.entries(result.schema.enums.changed)) {
    out.push(`  ${name}`);
    for (const v of c.added) out.push(`    + ${v}`);
    for (const v of c.removed) out.push(`    - ${v}`);
  }
}
out.push('', 'Checker tag lists (skills/salesforce-flow-modernizer/scripts/check-flow.mjs)');
if (!Object.keys(result.checkerDrift).length) out.push('  in step with the schema');
for (const [name, d] of Object.entries(result.checkerDrift)) {
  out.push(`  ${name} against ${d.type}`);
  list('  in the schema, missing from the checker', d.notInChecker);
  list('  in the checker, not in the schema', d.notInSchema);
}
if (result.written) out.push('', `Wrote ${result.written}`);
console.log(out.join('\n'));
