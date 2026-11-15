#!/usr/bin/env node
// Repository smoke test. CONTRIBUTING.md, "Before you open a pull request",
// lists what it checks. Exits non-zero on any failure so CI fails loudly.

import { spawnSync } from 'node:child_process';
import { readFileSync, readlinkSync, existsSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bareMentions } from './mentions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// The plugin skills are the folders under skills/ that hold a SKILL.md. Only
// the core skill ships the checker, the README stamp and the hook.
const CORE = 'salesforce-flow-modernizer';
const skillsRoot = join(root, 'skills');
const skills = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(skillsRoot, d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort();
const coreDir = join(skillsRoot, CORE);

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

// Manifests and versions
const claudePlugin = readJson('.claude-plugin/plugin.json');
const claudeMarketplace = readJson('.claude-plugin/marketplace.json');
const codexPlugin = readJson('.codex-plugin/plugin.json');
const codexMarketplace = readJson('.agents/plugins/marketplace.json');

check(claudePlugin.name === codexPlugin.name, 'plugin names differ between Claude Code and Codex manifests');
check(claudePlugin.version === codexPlugin.version, 'plugin versions differ between Claude Code and Codex manifests');
check(claudeMarketplace.plugins?.[0]?.name === claudePlugin.name, 'Claude Code marketplace entry does not name the plugin');
check(codexMarketplace.plugins?.[0]?.name === codexPlugin.name, 'Codex marketplace entry does not name the plugin');

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
check(changelog.includes(`## [${claudePlugin.version}]`), `CHANGELOG.md has no entry for ${claudePlugin.version}`);
const changelogMentions = bareMentions(changelog);
check(changelogMentions.length === 0, `CHANGELOG.md mentions ${changelogMentions.join(', ')}; put each in backticks`);
check(
  bareMentions('Reads @AuraEnabled, not `@isTest` or a@b.de\n```apex\n@future\n```\n<!-- @wire -->').join() === '@AuraEnabled',
  'mentions.mjs does not find exactly the bare mention outside code and comments',
);

// Release baseline, which every SKILL.md is stamped with
const baseline = readJson('maintenance/release.json');
check(/^(Spring|Summer|Winter) '\d\d$/.test(baseline.release ?? ''), `maintenance/release.json has no release like "Winter '27"`);
check(Number.isInteger(baseline.apiVersion), 'maintenance/release.json has no integer apiVersion');
check(/^\d{4}-\d{2}-\d{2}$/.test(baseline.reviewedOn ?? ''), 'maintenance/release.json has no reviewedOn date');
const flat = (text) => text.replace(/\s+/g, ' ');
const stamp = `last reviewed against ${baseline.release} (API ${baseline.apiVersion}.0)`;

// A frontmatter value, inline or as an indented block after `key: >` or `key: |`
const field = (frontmatter, key) => {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)((?:\\n[ \\t]+.*)*)`, 'm'));
  if (!match) return undefined;
  const value = /^([>|][+-]?)?$/.test(match[1].trim()) ? match[2] : match[1] + match[2];
  return value.replace(/\s+/g, ' ').trim().replace(/^(["'])(.*)\1$/, '$2');
};
const exampleFlowsOf = (dir) =>
  existsSync(join(dir, 'examples', 'flows')) ? readdirSync(join(dir, 'examples', 'flows')).filter((f) => f.endsWith('.flow-meta.xml')) : [];

check(skills.includes(CORE), `skills/${CORE} has no SKILL.md`);
for (const name of skills) {
  const dir = join(skillsRoot, name);
  const at = `skills/${name}`;

  // Codex discovery symlink
  const linkPath = join(root, '.agents/skills', name);
  check(existsSync(linkPath), `.agents/skills/${name} is missing`);
  if (existsSync(linkPath)) {
    const target = resolve(dirname(linkPath), readlinkSync(linkPath));
    check(target === dir, `.agents/skills/${name} points at ${target}`);
  }

  // SKILL.md frontmatter, size and stamp
  const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const skillName = field(frontmatter, 'name') ?? '';
  check(skillName === name, `${at}/SKILL.md frontmatter name "${skillName}" does not match the folder`);
  check(skillName.length >= 1 && skillName.length <= 64, `${at}/SKILL.md name is ${skillName.length} characters (1 to 64)`);
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName), `${at}/SKILL.md name "${skillName}" is not lowercase words joined by single hyphens`);
  const description = field(frontmatter, 'description') ?? '';
  check(description.length > 0, `${at}/SKILL.md frontmatter has no description`);
  check(description.length <= 1024, `${at}/SKILL.md description is ${description.length} characters (limit 1024)`);
  check(skillMd.split('\n').length <= 250, `${at}/SKILL.md exceeds 250 lines; move detail into references/`);
  check(flat(skillMd).includes(stamp), `${at}/SKILL.md does not say it was ${stamp}`);

  // SKILL.md links every reference, and every relative link resolves inside skills/
  const references = existsSync(join(dir, 'references')) ? readdirSync(join(dir, 'references')).filter((f) => f.endsWith('.md')).sort() : [];
  for (const ref of references) {
    check(skillMd.includes(`](references/${ref})`), `${at}/SKILL.md does not link references/${ref}`);
  }
  for (const doc of ['SKILL.md', ...references.map((ref) => `references/${ref}`)]) {
    const prose = readFileSync(join(dir, doc), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const [, link] of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^([a-z][a-z0-9+.-]*:|#)/i.test(link)) continue;
      const target = resolve(dirname(join(dir, doc)), link.split('#')[0]);
      const inside = target.startsWith(skillsRoot + sep);
      check(inside, `${at}/${doc} links ${link}, which is outside skills/`);
      if (inside) check(existsSync(target), `${at}/${doc} links missing ${link}`);
    }
  }

  // Examples: every file referenced from SKILL.md and vice versa, each verified
  const exampleFlows = exampleFlowsOf(dir);
  for (const file of exampleFlows) {
    const apiName = file.replace('.flow-meta.xml', '');
    const xml = readFileSync(join(dir, 'examples', 'flows', file), 'utf8');
    check(/Verified: deployed/.test(xml), `${at} example ${file} has no "Verified:" line in its header comment`);
    if (apiName !== 'Account_Count_Open_Opportunities') {
      check(skillMd.includes(`\`${apiName}\``), `${at} example ${apiName} is not referenced in SKILL.md`);
    }
  }
  if (existsSync(join(dir, 'examples', 'flows'))) {
    for (const [, apiName] of skillMd.matchAll(/`([A-Z][A-Za-z]+(?:_[A-Z][A-Za-z]*)+)`/g)) {
      if (/^(Object|Type)_/.test(apiName) || !/_(Create|Before|Closed|Event|Wait|Order|Check|Get|Allocate|Count)/.test(apiName)) continue;
      check(exampleFlows.includes(`${apiName}.flow-meta.xml`), `${at}/SKILL.md names example ${apiName}, which does not exist`);
    }
  }
}

// Shared blocks: the core skill holds each one once, and every copy in another
// skill matches it character for character.
const markdownOf = (dir) => [
  join(dir, 'SKILL.md'),
  ...(existsSync(join(dir, 'references')) ? readdirSync(join(dir, 'references')).filter((f) => f.endsWith('.md')).map((f) => join(dir, 'references', f)) : []),
];
const SHARED = /<!-- shared:([\w-]+) -->\n([\s\S]*?)<!-- \/shared:([\w-]+) -->/g;
const sharedBlocks = (dir) =>
  markdownOf(dir).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const opens = source.match(/<!-- shared:[\w-]+ -->/g)?.length ?? 0;
    const blocks = [...source.matchAll(SHARED)].map(([, id, body, closeId]) => ({ id, body, closeId, file: relative(root, file) }));
    check(opens === blocks.length, `${relative(root, file)} has a shared: marker without its /shared: marker`);
    for (const b of blocks) check(b.id === b.closeId, `${b.file} opens shared:${b.id} and closes shared:${b.closeId}`);
    return blocks;
  });
const coreShared = new Map();
for (const block of sharedBlocks(coreDir)) {
  check(!coreShared.has(block.id), `skills/${CORE} holds shared:${block.id} more than once`);
  coreShared.set(block.id, block.body);
}
for (const name of skills.filter((s) => s !== CORE)) {
  for (const block of sharedBlocks(join(skillsRoot, name))) {
    check(coreShared.has(block.id), `${block.file} copies shared:${block.id}, which skills/${CORE} doesn't hold`);
    if (coreShared.has(block.id)) check(block.body === coreShared.get(block.id), `${block.file} shared:${block.id} differs from the copy in skills/${CORE}`);
  }
}

// Automation mapper: lists the fixture project's automation and its overlaps
const mapper = join(skillsRoot, 'salesforce-automation-mapper', 'scripts', 'map-automation.mjs');
if (existsSync(mapper)) {
  const fixtureProject = join(root, 'evals', 'fixtures', 'account-automation');
  const runMapper = (object, dir) => {
    const result = spawnSync(process.execPath, [mapper, '--object', object, '--project-dir', dir, '--json'], { encoding: 'utf8' });
    try {
      return { status: result.status, out: JSON.parse(result.stdout) };
    } catch {
      return { status: result.status, out: null };
    }
  };
  const map = runMapper('Account', fixtureProject);
  const byName = new Map((map.out?.items ?? []).map((i) => [i.name, i]));
  check(map.status === 0 && byName.size === 12, `map-automation lists ${byName.size} items on the fixture's Account (expected 12)`);
  const expectItems = {
    Account_Before_Tag_A: { stage: 'before-save', event: 'CreateAndUpdate', triggerOrder: 10 },
    Account_Before_Tag_Unordered: { stage: 'before-save', triggerOrder: null },
    Account_Before_Tag_Late: { stage: 'before-save', triggerOrder: 1500 },
    Account_After_Create_Set_Rating: { stage: 'after-save', event: 'Create', triggerOrder: 20 },
    Account_After_Revenue_Reached: { stage: 'after-save', event: 'Update', onlyWhenUpdatedToMeet: true },
    Account_Daily_Review: { kind: 'schedule-triggered flow', status: 'Draft' },
    Account_Process_Banking: { kind: 'process', start: 'onAllChanges' },
    Account_Hot_Rating: { kind: 'workflow rule', evaluation: 'onCreateOrTriggeringUpdate' },
    Account_Flag_Hot: { kind: 'workflow rule', evaluation: 'onAllChanges' },
    AccountTrigger: { kind: 'Apex trigger', status: 'Active' },
  };
  for (const [name, facts] of Object.entries(expectItems)) {
    for (const [key, value] of Object.entries(facts)) {
      check(byName.get(name)?.[key] === value, `map-automation reports ${name} ${key} as ${JSON.stringify(byName.get(name)?.[key])}, not ${JSON.stringify(value)}`);
    }
  }
  check(byName.get('Account_Process_Banking')?.criteria?.[0]?.onlyWhenChanged === true, 'map-automation misses the process node set to only when specified changes');
  check(/re-evaluates workflow rules/.test(byName.get('Account_Hot_Rating')?.writes?.Rating?.[0] ?? ''), 'map-automation misses the field update that re-evaluates workflow rules');
  const writers = (field) => (map.out?.fieldWriters?.[field] ?? []).map((w) => w.split(': ')[1]).sort().join();
  check(writers('Rating') === 'Account_After_Create_Set_Rating,Account_Before_Tag_A,Account_Hot_Rating', `map-automation lists Rating writers ${writers('Rating')}`);
  check(writers('Type') === 'Account_Before_Tag_Late,Account_Process_Banking', `map-automation lists Type writers ${writers('Type')}`);
  check(writers('Site') === 'Account_Flag_Hot', `map-automation lists Site writers ${writers('Site')}`);
  const empty = runMapper('Contact', fixtureProject);
  check(empty.status === 0 && empty.out?.items.length === 0, 'map-automation lists automation on Contact in the fixture, which has none');
  const bare = mkdtempSync(join(tmpdir(), 'map-bare-'));
  try {
    mkdirSync(join(bare, 'force-app'));
    writeFileSync(join(bare, 'sfdx-project.json'), '{"packageDirectories":[{"path":"force-app","default":true}]}');
    const partial = runMapper('Account', bare);
    check(partial.status === 2 && partial.out?.notes.some((n) => /No flows\/ folder.*retrieve/i.test(n)), 'map-automation does not say what to retrieve in a project without flows/');
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
}

// Core skill: its examples are checker-clean
const coreMd = readFileSync(join(coreDir, 'SKILL.md'), 'utf8');
const coreExampleFlows = exampleFlowsOf(coreDir);
const checker = join(coreDir, 'scripts', 'check-flow.mjs');
const runChecker = (...args) => {
  const result = spawnSync(process.execPath, [checker, '--json', ...args], { encoding: 'utf8' });
  try {
    return { status: result.status, results: JSON.parse(result.stdout) };
  } catch {
    return { status: result.status, results: [] };
  }
};

const exampleRun = runChecker('--api', '67', join(coreDir, 'examples', 'flows'));
check(exampleRun.status === 0, 'check-flow reports ERRORs on the examples');
check(exampleRun.results.length === coreExampleFlows.length, 'check-flow did not read every example');

// The checker must keep catching the legacy fixture's planted problems
const fixture = join(root, 'evals', 'audit-legacy-flow', 'fixtures', 'Opportunity_Legacy_Rollup.flow-meta.xml');
const fixtureRun = runChecker('--api', '67', fixture);
const codes = new Set(fixtureRun.results.flatMap((r) => r.findings.map((f) => f.code)));
check(fixtureRun.status === 1, 'check-flow does not fail the legacy fixture');
for (const code of ['FLOW001', 'FLOW004', 'FLOW005', 'FLOW008', 'FLOW010', 'FLOW011', 'FLOW012', 'FLOW014', 'FLOW015']) {
  check(codes.has(code), `check-flow no longer reports ${code} on the legacy fixture`);
}

// Deploy-time shape rules the checker enforces
const scratch = mkdtempSync(join(tmpdir(), 'check-flow-'));
try {
  const shapes = {
    'Split_Groups.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion>',
      '<formulas><name>a</name><dataType>String</dataType><expression>"a"</expression></formulas>',
      '<label>x</label>',
      '<formulas><name>b</name><dataType>String</dataType><expression>"b"</expression></formulas>',
      '<processType>AutoLaunchedFlow</processType></Flow>',
    ].join(''),
    'Before_Save_Transform.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion>',
      '<label>x</label><processType>AutoLaunchedFlow</processType>',
      '<start><object>Account</object><recordTriggerType>Update</recordTriggerType><triggerType>RecordBeforeSave</triggerType>',
      '<filterFormula>ISCHANGED({!$Record.Name})</filterFormula></start>',
      '<transforms><name>T</name><dataType>Number</dataType></transforms></Flow>',
    ].join(''),
    'Async_Label.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion>',
      '<label>x</label><processType>AutoLaunchedFlow</processType>',
      '<start><object>Account</object><recordTriggerType>Create</recordTriggerType><triggerType>RecordAfterSave</triggerType>',
      '<scheduledPaths><name>A</name><label>A</label><pathType>AsyncAfterCommit</pathType></scheduledPaths></start></Flow>',
    ].join(''),
    'Split_Join.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion>',
      '<label>x</label><processType>AutoLaunchedFlow</processType>',
      '<transforms><name>J</name><transformValues><transformValueName>Joined</transformValueName></transformValues></transforms>',
      '<transforms><name>M</name><transformValues><transformValueActions><value>',
      '<transformValueReference>Joined[$EachItem].LeftTable.Id</transformValueReference></value></transformValueActions></transformValues></transforms></Flow>',
    ].join(''),
    'Invented_Tag.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion>',
      '<assignments><name>A</name><assignmentItems><assignToReference>x</assignToReference><operator>Assign</operator>',
      '<value><formulaValue>1</formulaValue></value></assignmentItems></assignments>',
      '<label>x</label><processType>AutoLaunchedFlow</processType></Flow>',
    ].join(''),
    'Auto_Layout_Ends.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>68.0</apiVersion>',
      '<assignments><name>A</name><label>A</label><locationX>0</locationX><locationY>0</locationY><group>G</group>',
      '<assignmentItems><assignToReference>t</assignToReference><operator>Assign</operator>',
      '<value><timeValue>09:00:00.000Z</timeValue></value></assignmentItems>',
      '<connector><targetReference>End_A</targetReference></connector></assignments>',
      '<ends><name>End_A</name><label>End</label><locationX>0</locationX><locationY>0</locationY></ends>',
      '<label>x</label>',
      '<processMetadataValues><name>CanvasMode</name><value><stringValue>AUTO_LAYOUT_CANVAS</stringValue></value></processMetadataValues>',
      '<processType>AutoLaunchedFlow</processType>',
      '<start><locationX>0</locationX><locationY>0</locationY><connector><targetReference>A</targetReference></connector></start></Flow>',
    ].join(''),
    'Free_Form_Ends.flow-meta.xml': [
      '<Flow xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>68.0</apiVersion>',
      '<ends><name>End_A</name><label>End</label><locationX>0</locationX><locationY>0</locationY></ends>',
      '<label>x</label><processType>AutoLaunchedFlow</processType>',
      '<start><locationX>0</locationX><locationY>0</locationY><connector><targetReference>End_A</targetReference></connector></start></Flow>',
    ].join(''),
  };
  // Shapes Flow Builder saves from Winter '27 on, which must not trip the tag check
  const absent = { 'Auto_Layout_Ends.flow-meta.xml': ['FLOW018', 'FLOW019'] };
  const expected = { 'Split_Groups.flow-meta.xml': 'FLOW016', 'Before_Save_Transform.flow-meta.xml': 'FLOW006', 'Async_Label.flow-meta.xml': 'FLOW007', 'Split_Join.flow-meta.xml': 'FLOW017', 'Invented_Tag.flow-meta.xml': 'FLOW018', 'Free_Form_Ends.flow-meta.xml': 'FLOW019' };
  for (const [file, xml] of Object.entries(shapes)) writeFileSync(join(scratch, file), xml);
  const shapeRun = runChecker(scratch);
  for (const r of shapeRun.results) {
    const name = r.file.split(/[\\/]/).pop();
    if (absent[name]) for (const code of absent[name]) check(!r.findings.some((f) => f.code === code), `check-flow reports ${code} on ${name}`);
    else check(r.findings.some((f) => f.code === expected[name]), `check-flow misses ${expected[name]} on ${name}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Release baseline in the core SKILL.md's step 2 and the README
check(flat(coreMd).includes(`or ${baseline.apiVersion}.0 when that is missing`), `skills/${CORE}/SKILL.md step 2 does not fall back to ${baseline.apiVersion}.0`);
check(flat(readFileSync(join(root, 'README.md'), 'utf8')).includes(stamp), `README.md does not say the skill was ${stamp}`);

// Maintainer skill and its Codex symlink
const reviewSkill = join(root, '.claude', 'skills', 'release-review');
check(/^name: release-review$/m.test(readFileSync(join(reviewSkill, 'SKILL.md'), 'utf8')), 'release-review SKILL.md has no matching name');
const reviewLink = join(root, '.agents/skills/release-review');
check(existsSync(reviewLink) && resolve(dirname(reviewLink), readlinkSync(reviewLink)) === reviewSkill, '.agents/skills/release-review does not point at .claude/skills/release-review');

// Review scripts
const runScript = (script, ...args) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { encoding: 'utf8' });
  try {
    return { status: result.status, out: JSON.parse(result.stdout) };
  } catch {
    return { status: result.status, out: null };
  }
};
const wsdl = join(root, 'scripts', 'fixtures', 'metadata-flow-sample.wsdl');
const parsed = runScript('diff-flow-schema.mjs', wsdl, '--snapshot');
check(parsed.status === 0 && parsed.out?.types?.Flow && parsed.out.types.Metadata, 'diff-flow-schema does not parse the fixture WSDL');
if (parsed.out?.types?.Flow) {
  const older = structuredClone(parsed.out);
  delete older.types.Flow.fields.transforms;
  older.types.FlowTransform.fields.dataType = 'String';
  older.enums.FlowTransformValueActionType.push('Join');
  const schemaDir = mkdtempSync(join(tmpdir(), 'flow-schema-'));
  try {
    writeFileSync(join(schemaDir, 'old.json'), JSON.stringify(older));
    const d = runScript('diff-flow-schema.mjs', wsdl, '--api', '68', '--against', join(schemaDir, 'old.json'), '--json')?.out?.schema;
    check(d?.types.changed.Flow?.added.includes('transforms: FlowTransform[]'), 'diff-flow-schema misses an added field');
    check(d?.types.changed.FlowTransform?.retyped.includes('dataType: String -> FlowDataType'), 'diff-flow-schema misses a retyped field');
    check(d?.enums.changed.FlowTransformValueActionType?.removed.includes('Join'), 'diff-flow-schema misses a removed enumeration value');
  } finally {
    rmSync(schemaDir, { recursive: true, force: true });
  }
}
const schemaSnapshots = existsSync(join(root, 'maintenance', 'flow-schema'))
  ? readdirSync(join(root, 'maintenance', 'flow-schema')).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
  : [];
if (schemaSnapshots.length) {
  const newest = schemaSnapshots.at(-1);
  const drift = runScript('diff-flow-schema.mjs', join(root, 'maintenance', 'flow-schema', newest), '--json').out?.checkerDrift;
  check(drift && Object.keys(drift).length === 0, `check-flow.mjs tag lists differ from maintenance/flow-schema/${newest}; run diff-flow-schema.mjs on it`);
}
const inventory = runScript('source-inventory.mjs', '--json');
check(inventory.status === 0 && inventory.out?.sources.length > 0, 'source-inventory finds no sources');
const contributingLinks = readFileSync(join(root, 'CONTRIBUTING.md'), 'utf8').match(/https:\/\/(?:help|developer)\.salesforce\.com\//g)?.length ?? 0;
const maintainerCitations = inventory.out?.maintainerSources?.flatMap((s) => s.citations.filter((c) => c.file === 'CONTRIBUTING.md')) ?? [];
check(maintainerCitations.length === contributingLinks, `source-inventory lists ${maintainerCitations.length} of the ${contributingLinks} official links in CONTRIBUTING.md`);

// validate-examples must deploy without running the org's Apex tests. A stub
// `sf` on PATH prints the arguments it was called with.
if (process.platform !== 'win32') {
  const stubDir = mkdtempSync(join(tmpdir(), 'sf-stub-'));
  try {
    writeFileSync(join(stubDir, 'sf'), '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'validate-examples.mjs'), '--target-org', 'smoke-org'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    });
    let sfArgs = [];
    try {
      sfArgs = JSON.parse(result.stdout);
    } catch {}
    const flag = (name) => sfArgs[sfArgs.indexOf(name) + 1];
    check(result.status === 0 && sfArgs.slice(0, 3).join(' ') === 'project deploy start', `validate-examples does not run "sf project deploy start" (ran: sf ${sfArgs.join(' ')})`);
    check(sfArgs.includes('--dry-run') && flag('--test-level') === 'NoTestRun', 'validate-examples does not dry-run the deploy with --test-level NoTestRun');
    check(flag('--target-org') === 'smoke-org', 'validate-examples does not pass --target-org to sf');
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }
}

// Release and release notes scripts, run on a copy so the real manifests and
// changelog stay put. The copy gets an [Unreleased] entry, since right after a
// release it has none.
{
  const copy = mkdtempSync(join(tmpdir(), 'release-'));
  try {
    for (const path of ['scripts/release.mjs', 'scripts/release-notes.mjs', 'scripts/mentions.mjs', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'CHANGELOG.md']) {
      mkdirSync(dirname(join(copy, path)), { recursive: true });
      copyFileSync(join(root, path), join(copy, path));
    }
    const copied = (path) => readFileSync(join(copy, path), 'utf8');
    writeFileSync(join(copy, 'CHANGELOG.md'), copied('CHANGELOG.md').replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n\n- Smoke test entry.\n'));
    const release = (...args) => spawnSync(process.execPath, [join(copy, 'scripts', 'release.mjs'), ...args], { encoding: 'utf8' });

    check(/not newer/.test(release(claudePlugin.version).stderr), 'release.mjs accepts a version that is not newer');
    const run = release('99.0.0', '--date', '2099-01-01');
    check(run.status === 0, `release.mjs failed: ${run.stderr.trim()}`);
    for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      check(JSON.parse(copied(path)).version === '99.0.0', `release.mjs does not set the version in ${path}`);
    }
    const released = copied('CHANGELOG.md');
    check(released.includes('## [Unreleased]\n\n## [99.0.0] - 2099-01-01\n\n### Added\n\n- Smoke test entry.\n'), 'release.mjs does not move the [Unreleased] entries under 99.0.0');
    check(/^\[Unreleased\]: \S+\/compare\/v99\.0\.0\.\.\.HEAD\n\[99\.0\.0\]: \S+\/releases\/tag\/v99\.0\.0$/m.test(released), 'release.mjs does not update the changelog links');
    check(/nothing under/.test(release('99.0.1').stderr), 'release.mjs releases an empty [Unreleased]');

    const notes = (version) => spawnSync(process.execPath, [join(copy, 'scripts', 'release-notes.mjs'), version], { encoding: 'utf8' });
    const newestNotes = notes('99.0.0').stdout;
    check(newestNotes.startsWith('### Added\n\n- Smoke test entry.\n') && !/^## /m.test(newestNotes), 'release-notes.mjs does not print the 99.0.0 section alone, without its heading');
    const oldest = [...released.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].at(-1)?.[1];
    const oldestNotes = notes(oldest);
    check(oldestNotes.status === 0 && oldestNotes.stdout.trim() && !/^\[[^\]]+\]: /m.test(oldestNotes.stdout), `release-notes.mjs does not stop the ${oldest} section before the changelog links`);
    check(notes('98.0.0').status !== 0, 'release-notes.mjs prints notes for a version the changelog lacks');
    writeFileSync(join(copy, 'CHANGELOG.md'), released.replace('- Smoke test entry.', '- Smoke test entry for @AuraEnabled.'));
    check(/mentions @AuraEnabled/.test(notes('99.0.0').stderr), 'release-notes.mjs prints notes that mention an account');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

// Version rule of cut-release.mjs, without its git and gh steps
{
  const { bumpFor, nextVersion } = await import(pathToFileURL(join(root, 'scripts', 'cut-release.mjs')).href);
  const fix = { subject: 'fix(skill): x', body: '' };
  check(bumpFor({ version: '0.4.0', unreleased: '### Fixed\n\n- x', commits: [fix] }) === 'patch', 'cut-release.mjs does not pick patch for fixes only');
  check(bumpFor({ version: '0.4.0', unreleased: '### Added\n\n- x', commits: [fix] }) === 'minor', 'cut-release.mjs does not pick minor for an Added entry');
  check(bumpFor({ version: '0.4.0', unreleased: '### Fixed', commits: [{ subject: 'feat(skill)!: x', body: '' }] }) === 'minor', 'cut-release.mjs does not pick minor for a breaking change below 1.0.0');
  check(bumpFor({ version: '1.2.0', unreleased: '### Fixed', commits: [{ subject: 'fix: x', body: 'BREAKING CHANGE: y' }] }) === 'major', 'cut-release.mjs does not pick major for a breaking change from 1.0.0');
  check(bumpFor({ version: '1.2.0', unreleased: '### Removed', commits: [fix] }) === 'major', 'cut-release.mjs does not treat a Removed entry as breaking');
  check(['0.4.1', '0.5.0', '1.0.0'].join() === ['patch', 'minor', 'major'].map((b) => nextVersion('0.4.0', b)).join(), 'cut-release.mjs computes the wrong next version');
}

// Eval suite: every case has a prompt and graders with a type
const evalsDir = join(root, 'evals');
const cases = readdirSync(evalsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !['results', 'fixtures'].includes(d.name));
check(cases.length >= 8, `only ${cases.length} eval cases`);
for (const { name } of cases) {
  const dir = join(evalsDir, name);
  check(existsSync(join(dir, 'prompt.md')), `eval ${name} has no prompt.md`);
  const graders = existsSync(join(dir, 'graders')) ? readdirSync(join(dir, 'graders')).filter((f) => f.endsWith('.md')) : [];
  check(graders.length >= 2, `eval ${name} has fewer than two graders`);
  for (const g of graders) {
    const text = readFileSync(join(dir, 'graders', g), 'utf8');
    check(/^---\ntype: (regex|tool_used|tool_order|file_exists|llm|baseline)\n/.test(text), `eval ${name} grader ${g} has no valid type`);
  }
}

// Hook
const runHook = (filePath) => {
  const result = spawnSync(process.execPath, [join(root, 'hooks/sfdx-skill-guard.mjs')], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  check(result.status === 0, `hook exited ${result.status} for ${filePath}`);
  return result.stdout;
};

const flowOut = runHook('/repo/force-app/main/default/flows/Case_Set_Priority.flow-meta.xml');
check(flowOut.includes(CORE),'hook stays silent on a flows/ path');
check(runHook('/repo/force-app/main/default/classes/CaseService.cls') === '', 'hook speaks on a classes/ path');
check(runHook('/repo/README.md') === '', 'hook speaks on a non-sfdx path');

const runCodexHook = (patch) => {
  const result = spawnSync(process.execPath, [join(root, 'hooks/sfdx-skill-guard.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: patch } }),
    encoding: 'utf8',
  });
  check(result.status === 0, `hook exited ${result.status} for a Codex patch`);
  return result.stdout;
};
const patch = (...sections) => ['*** Begin Patch', ...sections, '*** End Patch', ''].join('\n');
const FLOW = 'force-app/main/default/flows/Case_Set_Priority.flow-meta.xml';
const CLASS = 'force-app/main/default/classes/CaseService.cls';
const speaksOnce = (out) => {
  try {
    return JSON.parse(out).hookSpecificOutput.additionalContext.includes(CORE);
  } catch {
    return false;
  }
};

check(speaksOnce(runCodexHook(patch(`*** Add File: ${FLOW}`, '+<Flow/>'))), 'hook gives no single reminder on a Codex patch adding a flow');
check(speaksOnce(runCodexHook(patch(`*** Update File: /repo/${FLOW}`, '@@', '-<a/>', '+<b/>'))), 'hook gives no single reminder on a Codex patch updating a flow');
check(
  speaksOnce(runCodexHook(patch(`*** Update File: ${CLASS}`, '@@', '-a', '+b', `*** Add File: ${FLOW}`, '+<Flow/>', `*** Add File: ${FLOW.replace('Case_', 'Lead_')}`, '+<Flow/>'))),
  'hook gives no single reminder on a multi-file Codex patch with flows',
);
check(speaksOnce(runCodexHook(patch('*** Update File: tmp/Draft.flow-meta.xml', `*** Move to: ${FLOW}`, '@@', '-a', '+b'))), 'hook gives no single reminder on a Codex patch moving a file into flows/');
check(runCodexHook(patch(`*** Update File: ${FLOW}`, `*** Move to: tmp/Draft.flow-meta.xml`, '@@', '-a', '+b')) === '', 'hook speaks on a Codex patch moving a flow out of flows/');
check(runCodexHook(patch(`*** Add File: ${CLASS}`, '+class CaseService {}', '*** Update File: README.md', '@@', '-a', '+b')) === '', 'hook speaks on a Codex patch with no flow');
check(runCodexHook(patch(`*** Delete File: ${FLOW}`)) === '', 'hook speaks on a Codex patch deleting a flow');
check(runCodexHook('') === '', 'hook speaks on an empty Codex patch');

const malformed = spawnSync(process.execPath, [join(root, 'hooks/sfdx-skill-guard.mjs')], {
  input: 'not json',
  encoding: 'utf8',
});
check(malformed.status === 0 && malformed.stdout === '', 'hook does not stay silent on malformed input');

// Code comments, per CONTRIBUTING.md. Blank lines neither break nor extend a block.
const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
check(tracked.status === 0, 'git ls-files failed, so code comments went unchecked');
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#(?!!))/;
for (const file of (tracked.stdout ?? '').split('\0').filter((f) => /\.(mjs|js|sh)$/.test(f) && existsSync(join(root, f)))) {
  let block = 0;
  let longest = 0;
  readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
    const whole = COMMENT_LINE.test(line);
    const comment = whole ? line : (line.match(/\s\/\/\s.*$/)?.[0] ?? '');
    if (whole) longest = Math.max(longest, ++block);
    else if (line.trim()) block = 0;
    check(!/https?:\/\//.test(comment), `${file}:${i + 1} has a link in a code comment; cite it in Markdown`);
  });
  check(longest <= 8, `${file} has a ${longest}-line comment block (limit 8)`);
}

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL ${message}`);
  process.exit(1);
}
console.log('smoke test passed');
