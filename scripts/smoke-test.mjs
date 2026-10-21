#!/usr/bin/env node
// Repository smoke test. CONTRIBUTING.md, "Before you open a pull request",
// lists what it checks. Exits non-zero on any failure so CI fails loudly.

import { spawnSync } from 'node:child_process';
import { readFileSync, readlinkSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const SKILL = 'salesforce-flow-modernizer';
const skillDir = join(root, 'skills', SKILL);

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

// Codex discovery symlink
const linkPath = join(root, '.agents/skills', SKILL);
check(existsSync(linkPath), `.agents/skills/${SKILL} is missing`);
if (existsSync(linkPath)) {
  const target = resolve(dirname(linkPath), readlinkSync(linkPath));
  check(target === skillDir, `.agents/skills/${SKILL} points at ${target}`);
}

// SKILL.md frontmatter, size, and one-level links
const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
check(new RegExp(`^name: ${SKILL}$`, 'm').test(frontmatter), 'SKILL.md frontmatter name does not match the folder');
check(/^description: >?/m.test(frontmatter), 'SKILL.md frontmatter has no description');
const description = frontmatter.split(/^description: >?\s*$/m)[1]?.replace(/\s+/g, ' ').trim() ?? '';
check(description.length > 0 && description.length <= 1024, `SKILL.md description is ${description.length} characters (limit 1024)`);
check(skillMd.split('\n').length <= 250, 'SKILL.md exceeds 250 lines; move detail into references/');

const references = readdirSync(join(skillDir, 'references')).filter((f) => f.endsWith('.md'));
for (const ref of references) {
  check(skillMd.includes(`](references/${ref})`), `SKILL.md does not link references/${ref}`);
}
for (const [, link] of skillMd.matchAll(/\]\((references\/[^)]+)\)/g)) {
  check(existsSync(join(skillDir, link)), `SKILL.md links missing ${link}`);
}

// Examples: every file referenced from SKILL.md and vice versa, each verified and checker-clean
const exampleFlows = readdirSync(join(skillDir, 'examples', 'flows')).filter((f) => f.endsWith('.flow-meta.xml'));
for (const file of exampleFlows) {
  const apiName = file.replace('.flow-meta.xml', '');
  const xml = readFileSync(join(skillDir, 'examples', 'flows', file), 'utf8');
  check(/Verified: deployed/.test(xml), `example ${file} has no "Verified:" line in its header comment`);
  if (apiName !== 'Account_Count_Open_Opportunities') {
    check(skillMd.includes(`\`${apiName}\``), `example ${apiName} is not referenced in SKILL.md`);
  }
}
for (const [, apiName] of skillMd.matchAll(/`([A-Z][A-Za-z]+(?:_[A-Z][A-Za-z]*)+)`/g)) {
  if (/^(Object|Type)_/.test(apiName) || !/_(Create|Before|Closed|Event|Wait|Order|Check|Get|Allocate|Count)/.test(apiName)) continue;
  check(exampleFlows.includes(`${apiName}.flow-meta.xml`), `SKILL.md names example ${apiName}, which does not exist`);
}

const checker = join(skillDir, 'scripts', 'check-flow.mjs');
const runChecker = (...args) => {
  const result = spawnSync(process.execPath, [checker, '--json', ...args], { encoding: 'utf8' });
  try {
    return { status: result.status, results: JSON.parse(result.stdout) };
  } catch {
    return { status: result.status, results: [] };
  }
};

const exampleRun = runChecker('--api', '67', join(skillDir, 'examples', 'flows'));
check(exampleRun.status === 0, 'check-flow reports ERRORs on the examples');
check(exampleRun.results.length === exampleFlows.length, 'check-flow did not read every example');

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

// Release baseline in SKILL.md and the README
const baseline = readJson('maintenance/release.json');
check(/^(Spring|Summer|Winter) '\d\d$/.test(baseline.release ?? ''), `maintenance/release.json has no release like "Winter '27"`);
check(Number.isInteger(baseline.apiVersion), 'maintenance/release.json has no integer apiVersion');
check(/^\d{4}-\d{2}-\d{2}$/.test(baseline.reviewedOn ?? ''), 'maintenance/release.json has no reviewedOn date');
const flat = (text) => text.replace(/\s+/g, ' ');
const stamp = `last reviewed against ${baseline.release} (API ${baseline.apiVersion}.0)`;
check(flat(skillMd).includes(stamp), `SKILL.md does not say it was ${stamp}`);
check(flat(skillMd).includes(`or ${baseline.apiVersion}.0 when that is missing`), `SKILL.md step 2 does not fall back to ${baseline.apiVersion}.0`);
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

// Eval suite: every case has a prompt and graders with a type
const evalsDir = join(root, 'evals');
const cases = readdirSync(evalsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'results');
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
check(flowOut.includes(SKILL), 'hook stays silent on a flows/ path');
check(runHook('/repo/force-app/main/default/classes/CaseService.cls') === '', 'hook speaks on a classes/ path');
check(runHook('/repo/README.md') === '', 'hook speaks on a non-sfdx path');

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
