#!/usr/bin/env node
// Lists the automation on one object in a local sfdx project, as the metadata
// states it: flows, processes, workflow rules and Apex triggers, with the
// saves each runs on and the object's fields each writes. It orders nothing.
//
//   node scripts/map-automation.mjs --object <ApiName> [--project-dir .] [--json]
//
// Exit code 0 with a listing, 2 when the project or its flows/ folder is missing.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const objectName = option('--object');
const projectDir = resolve(option('--project-dir') ?? '.');
const asJson = args.includes('--json');
if (!objectName) {
  console.error('Usage: map-automation.mjs --object <ApiName> [--project-dir .] [--json]');
  process.exit(1);
}
const sameObject = (name) => (name ?? '').toLowerCase() === objectName.toLowerCase();

// ---------- minimal XML reader (metadata files have no mixed content) ----------

function parseXml(source) {
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let match;
  while ((match = token.exec(source)) !== null) {
    const [, closing, opening, , selfClosing, text] = match;
    const top = stack[stack.length - 1];
    if (closing) {
      if (top.name !== closing) throw new Error(`mismatched </${closing}> inside <${top.name}>`);
      stack.pop();
    } else if (opening) {
      const node = { name: opening, children: [], text: '' };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
    } else if (text !== undefined) {
      top.text += decode(text);
    }
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].name}>`);
  return root.children[0];
}
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const kid = (node, name) => kids(node, name)[0];
const text = (node, name) => (kid(node, name)?.text ?? '').trim();
const descendants = (node, name) => (node ? node.children.flatMap((c) => [...(c.name === name ? [c] : []), ...descendants(c, name)]) : []);
const metaValue = (node, name) => {
  const entry = kids(node, 'processMetadataValues').find((p) => text(p, 'name') === name);
  const value = kid(entry, 'value');
  return value ? value.children.map((c) => c.text.trim()).join('') : undefined;
};

// ---------- project files ----------

function packageDirs() {
  const manifest = join(projectDir, 'sfdx-project.json');
  if (!existsSync(manifest)) return null;
  let dirs;
  try {
    dirs = JSON.parse(readFileSync(manifest, 'utf8')).packageDirectories ?? [];
  } catch (error) {
    console.error(`Could not read ${manifest}: ${error.message}`);
    process.exit(2);
  }
  return dirs.map((d) => join(projectDir, d.path)).filter((d) => existsSync(d));
}

function walk(dir, keep, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, keep, found);
    else if (keep(path)) found.push(path);
  }
  return found;
}

const dirs = packageDirs();
if (!dirs) {
  console.error(`No sfdx-project.json in ${projectDir}. Run this from the root of an sfdx project, or pass --project-dir.`);
  process.exit(2);
}
const files = dirs.flatMap((d) => walk(d, () => true));
const rel = (path) => relative(projectDir, path);
const flowFiles = files.filter((f) => f.endsWith('.flow-meta.xml'));
const hasFlowsFolder = files.some((f) => /(^|[\\/])flows[\\/]/.test(rel(f)));
const skipped = [];
const readXml = (file) => {
  try {
    return parseXml(readFileSync(file, 'utf8'));
  } catch (error) {
    skipped.push({ file: rel(file), reason: error.message });
    return null;
  }
};

// ---------- flows and processes ----------

function conditionsOf(start) {
  const formula = text(start, 'filterFormula');
  if (formula) return `formula: ${formula}`;
  const filters = kids(start, 'filters').map((f) => {
    const value = kid(f, 'value');
    const right = value ? value.children.map((c) => c.text.trim()).join('') : '';
    return `${text(f, 'field')} ${text(f, 'operator')} ${right}`.trim();
  });
  if (!filters.length) return null;
  const logic = text(start, 'filterLogic') || 'and';
  return filters.length === 1 ? filters[0] : `${logic}: ${filters.join('; ')}`;
}

// The scheduled and asynchronous paths that reach each element. An element the
// start's own connector reaches runs in the save and gets no entry.
function afterCommitPaths(flow) {
  const start = kid(flow, 'start');
  const edges = new Map();
  for (const el of flow.children) {
    const name = text(el, 'name');
    if (name && el.name !== 'start') edges.set(name, descendants(el, 'targetReference').map((t) => t.text.trim()));
  }
  const reach = (from) => {
    const seen = new Set();
    const queue = [from];
    while (queue.length) {
      const name = queue.shift();
      if (!name || seen.has(name) || !edges.has(name)) continue;
      seen.add(name);
      queue.push(...edges.get(name));
    }
    return seen;
  };
  const inSave = reach(text(kid(start, 'connector'), 'targetReference'));
  const paths = new Map();
  for (const p of kids(start, 'scheduledPaths')) {
    const label = text(p, 'pathType') === 'AsyncAfterCommit' ? 'the asynchronous path' : `scheduled path ${text(p, 'name')}`;
    for (const name of reach(text(kid(p, 'connector'), 'targetReference'))) {
      if (!inSave.has(name)) paths.set(name, [...(paths.get(name) ?? []), label]);
    }
  }
  return paths;
}
const AFTER_COMMIT = 'after the commit, on';

// Subflows and Apex or flow actions a flow or process calls. Their writes aren't read.
const flowCalls = (flow) => [
  ...kids(flow, 'subflows').map((s) => `subflow ${text(s, 'flowName')}`),
  ...kids(flow, 'actionCalls')
    .filter((a) => ['apex', 'flow'].includes(text(a, 'actionType')))
    .map((a) => `${text(a, 'actionType') === 'apex' ? 'Apex action' : 'flow action'} ${text(a, 'actionName')}`),
];

// Fields of the object a flow writes: on $Record before save, through Update
// Records on $Record or its Id after save, and through record variables.
function flowWrites(flow, { recordVar, beforeSave }) {
  const writes = new Map();
  const paths = afterCommitPaths(flow);
  const add = (field, how, element) => {
    const later = paths.get(element);
    if (!writes.has(field)) writes.set(field, new Set());
    writes.get(field).add(later ? `${how} (${AFTER_COMMIT} ${later.join(', ')})` : how);
  };
  const objectVars = new Set([
    ...kids(flow, 'variables').filter((v) => text(v, 'dataType') === 'SObject' && sameObject(text(v, 'objectType'))).map((v) => text(v, 'name')),
    ...kids(flow, 'recordLookups').filter((l) => text(l, 'storeOutputAutomatically') === 'true' && sameObject(text(l, 'object'))).map((l) => text(l, 'name')),
  ]);
  const assignedTo = (variable) =>
    descendants(flow, 'assignmentItems')
      .map((i) => text(i, 'assignToReference'))
      .filter((t) => t.startsWith(`${variable}.`))
      .map((t) => t.slice(variable.length + 1));
  if (beforeSave) {
    for (const assignment of kids(flow, 'assignments')) {
      for (const item of kids(assignment, 'assignmentItems')) {
        const target = text(item, 'assignToReference');
        if (target.startsWith(`${recordVar}.`)) add(target.slice(recordVar.length + 1), 'assignment to the triggering record', text(assignment, 'name'));
      }
    }
  }
  for (const update of kids(flow, 'recordUpdates')) {
    const element = text(update, 'name');
    const input = text(update, 'inputReference');
    const fields = kids(update, 'inputAssignments').map((a) => text(a, 'field'));
    const filters = kids(update, 'filters');
    const byOwnId = filters.some((f) => text(f, 'field') === 'Id' && text(kid(f, 'value'), 'elementReference') === `${recordVar}.Id`);
    if (input === recordVar || (sameObject(text(update, 'object')) && byOwnId)) {
      // Without field values of its own, Update Records saves what assignments put on $Record
      for (const field of fields.length ? fields : assignedTo(recordVar)) add(field, `Update Records ${element} on the triggering record`, element);
    } else if (sameObject(text(update, 'object'))) {
      for (const field of fields) add(field, `Update Records ${element} on other ${objectName} records`, element);
    } else if (objectVars.has(input)) {
      for (const field of assignedTo(input)) add(field, `Update Records ${element} through variable ${input}`, element);
    }
  }
  for (const create of kids(flow, 'recordCreates')) {
    if (sameObject(text(create, 'object'))) {
      for (const a of kids(create, 'inputAssignments')) add(text(a, 'field'), `Create Records ${text(create, 'name')} on new ${objectName} records`, text(create, 'name'));
    }
  }
  return writes;
}

const namesObject = (flow) =>
  ['recordCreates', 'recordUpdates', 'recordLookups', 'recordDeletes'].some((type) => kids(flow, type).some((el) => sameObject(text(el, 'object'))));

const items = [];
for (const file of flowFiles) {
  const flow = readXml(file);
  if (flow?.name !== 'Flow') continue;
  const name = basename(file, '.flow-meta.xml');
  const base = { name, file: rel(file), status: text(flow, 'status') || 'unknown', apiVersion: text(flow, 'apiVersion') || null };
  const start = kid(flow, 'start');
  const triggerType = text(start, 'triggerType');
  const processType = text(flow, 'processType');

  if (processType === 'Workflow') {
    if (!sameObject(metaValue(flow, 'ObjectType'))) continue;
    const decisions = kids(flow, 'decisions');
    const criteria = decisions
      .filter((d) => !text(d, 'name').endsWith('_pmetdec'))
      .flatMap((d) => kids(d, 'rules'))
      .map((r) => ({
        node: text(r, 'label') || text(r, 'name'),
        onlyWhenChanged: decisions.some((d) => text(d, 'name') === `${text(r, 'name')}_pmetdec`),
      }));
    const writes = new Map();
    for (const update of kids(flow, 'recordUpdates')) {
      // The record that started the process: an update of this object, by reference [Object] or by Id = myVariable_current.Id
      const target = text(update, 'object') || objectName;
      const own =
        sameObject(target) &&
        (metaValue(update, 'reference') === `[${objectName}]` ||
          kids(update, 'filters').some((f) => text(f, 'field') === 'Id' && text(kid(f, 'value'), 'elementReference') === 'myVariable_current.Id'));
      for (const a of kids(update, 'inputAssignments')) {
        // Another object's field is keyed Object.Field, as a cross-object workflow field update is
        const field = sameObject(target) ? text(a, 'field') : `${target}.${text(a, 'field')}`;
        if (!writes.has(field)) writes.set(field, new Set());
        writes.get(field).add(`Update Records ${text(update, 'name')} on ${own ? 'the record that started the process' : `related records (${metaValue(update, 'reference') ?? target})`}`);
      }
    }
    items.push({ ...base, kind: 'process', stage: 'process', start: metaValue(flow, 'TriggerType') ?? null, criteria, calls: flowCalls(flow), writes });
    continue;
  }

  if (/^Record(Before|After)(Save|Delete)$/.test(triggerType) && sameObject(text(start, 'object'))) {
    const beforeSave = triggerType === 'RecordBeforeSave';
    const order = text(flow, 'triggerOrder');
    const paths = kids(start, 'scheduledPaths').map((p) =>
      text(p, 'pathType') === 'AsyncAfterCommit'
        ? 'asynchronous path'
        : `scheduled path ${text(p, 'name')}: ${text(p, 'offsetNumber')} ${text(p, 'offsetUnit')} from ${text(p, 'recordField') || text(p, 'timeSource')}`,
    );
    items.push({
      ...base,
      kind: 'record-triggered flow',
      stage: { RecordBeforeSave: 'before-save', RecordAfterSave: 'after-save', RecordBeforeDelete: 'before-delete', RecordAfterDelete: 'after-delete' }[triggerType],
      event: text(start, 'recordTriggerType') || null,
      onlyWhenUpdatedToMeet: text(start, 'doesRequireRecordChangedToMeetCriteria') === 'true',
      entryConditions: conditionsOf(start),
      triggerOrder: order ? Number(order) : null,
      paths,
      calls: flowCalls(flow),
      writes: flowWrites(flow, { recordVar: '$Record', beforeSave }),
    });
  } else if (triggerType === 'Scheduled' && sameObject(text(start, 'object'))) {
    const schedule = kid(start, 'schedule');
    items.push({
      ...base,
      kind: 'schedule-triggered flow',
      stage: 'outside the save',
      schedule: schedule ? `${text(schedule, 'frequency')} from ${text(schedule, 'startDate')} ${text(schedule, 'startTime')}`.trim() : null,
      entryConditions: conditionsOf(start),
      calls: flowCalls(flow),
      writes: flowWrites(flow, { recordVar: '$Record', beforeSave: false }),
    });
  } else if (triggerType === 'PlatformEvent' && namesObject(flow)) {
    items.push({
      ...base,
      kind: 'platform event-triggered flow',
      stage: 'outside the save',
      event: text(start, 'object'),
      calls: flowCalls(flow),
      writes: flowWrites(flow, { recordVar: '$Record', beforeSave: false }),
    });
  }
}

// ---------- workflow rules ----------

for (const file of files.filter((f) => /[\\/]workflows[\\/]/.test(f) && f.endsWith('.workflow-meta.xml'))) {
  if (!sameObject(basename(file, '.workflow-meta.xml'))) continue;
  const workflow = readXml(file);
  if (!workflow) continue;
  const fieldUpdates = new Map(kids(workflow, 'fieldUpdates').map((u) => [text(u, 'fullName'), u]));
  for (const rule of kids(workflow, 'rules')) {
    const criteriaItems = kids(rule, 'criteriaItems').map((c) => `${text(c, 'field')} ${text(c, 'operation')} ${text(c, 'value')}`.trim());
    const formula = text(rule, 'formula');
    const actions = [
      ...kids(rule, 'actions').map((a) => ({ action: a, timing: 'immediate' })),
      ...kids(rule, 'workflowTimeTriggers').flatMap((t) =>
        kids(t, 'actions').map((a) => ({ action: a, timing: `time-dependent, ${text(t, 'timeLength')} ${text(t, 'workflowTimeTriggerUnit')} from ${text(t, 'offsetFromField') || 'the trigger'}` })),
      ),
    ];
    const writes = new Map();
    const otherActions = [];
    for (const { action, timing } of actions) {
      const actionName = text(action, 'name');
      const update = text(action, 'type') === 'FieldUpdate' ? fieldUpdates.get(actionName) : undefined;
      if (!update) {
        otherActions.push(`${text(action, 'type')} ${actionName} (${timing})`);
        continue;
      }
      const target = text(update, 'targetObject');
      const value = text(update, 'literalValue') || text(update, 'formula') || text(update, 'lookupValue') || (text(update, 'operation') === 'Null' ? 'blank' : '');
      const field = target ? `${target}.${text(update, 'field')}` : text(update, 'field');
      if (!writes.has(field)) writes.set(field, new Set());
      writes.get(field).add(
        `field update ${actionName} = ${value} (${timing}${text(update, 'reevaluateOnChange') === 'true' ? ', re-evaluates workflow rules' : ''}${target ? ', cross-object' : ''})`,
      );
    }
    items.push({
      name: text(rule, 'fullName'),
      file: rel(file),
      status: text(rule, 'active') === 'true' ? 'Active' : 'Inactive',
      kind: 'workflow rule',
      stage: 'workflow',
      evaluation: text(rule, 'triggerType') || null,
      criteria: formula ? `formula: ${formula}` : criteriaItems.length ? `${text(rule, 'booleanFilter') || 'and'}: ${criteriaItems.join('; ')}` : null,
      otherActions,
      writes,
    });
  }
}

// ---------- Apex triggers ----------

for (const file of files.filter((f) => f.endsWith('.trigger'))) {
  const source = readFileSync(file, 'utf8');
  // Comments go, string literals are emptied, in one pass so neither hides the other
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'/g, (m) => (m.startsWith("'") ? "''" : ' '));
  const header = code.match(/\btrigger\s+(\w+)\s+on\s+(\w+)\s*\(([^)]*)\)/i);
  if (!header || !sameObject(header[2])) continue;
  const meta = existsSync(`${file}-meta.xml`) ? readXml(`${file}-meta.xml`) : null;
  // Variables declared with the object's type: `Account a =`, `for (Account a : ...)`
  const typed = new Set();
  for (const [, type, name] of code.matchAll(/\b([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*(?=[=;:,)])/g)) {
    if (sameObject(type)) typed.add(name.toLowerCase());
  }
  const writes = new Map();
  // Field assignments on Trigger.new[i] or on a variable of the object's type
  for (const [, receiver, field] of code.matchAll(/(\bTrigger\s*\.\s*new\s*\[[^\]]*\]|\b[A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*(?:\+|-)?=(?!=)/gi)) {
    if (!/^trigger/i.test(receiver) && !typed.has(receiver.toLowerCase())) continue;
    if (!writes.has(field)) writes.set(field, new Set());
    writes.get(field).add(`assignment in the trigger body (pattern match on ${objectName} variables and Trigger.new, not parsed)`);
  }
  const calls = [...new Set([...code.matchAll(/\b(?:new\s+)?([A-Z]\w*)\s*(?:\.\s*\w+\s*)?\(/g)].map((m) => m[1]))].filter(
    (n) => !/^(Trigger|System|Database|Schema|String|Integer|Decimal|Date|Datetime|Math|JSON|Set|Map|List|Limits|Test|Account|Contact|Opportunity|Lead|Case)$/.test(n) && !sameObject(n),
  );
  items.push({
    name: header[1],
    file: rel(file),
    status: meta ? text(meta, 'status') || 'unknown' : 'unknown',
    kind: 'Apex trigger',
    stage: 'Apex trigger',
    events: header[3].split(',').map((e) => e.trim().replace(/\s+/g, ' ')).filter(Boolean),
    calls,
    writes,
  });
}

// ---------- output ----------

const plain = (item) => ({ ...item, writes: Object.fromEntries([...item.writes].map(([f, how]) => [f, [...how]])) });
// Field names are case-insensitive (Apex writes `a.rating` for Rating), so writers are grouped by
// lower case under the first spelling seen. A writer whose every write lands after the commit says so.
const byField = new Map();
for (const item of items) {
  for (const [field, how] of item.writes) {
    const entry = byField.get(field.toLowerCase()) ?? { field, writers: [] };
    byField.set(field.toLowerCase(), entry);
    const later = [...how].every((h) => h.includes(AFTER_COMMIT));
    const writer = `${item.kind}: ${item.name}${later ? ' (after the commit)' : ''}`;
    if (!entry.writers.includes(writer)) entry.writers.push(writer);
  }
}
const fieldWriters = Object.fromEntries([...byField.values()].map((e) => [e.field, e.writers]));
const STAGES = ['before-save', 'Apex trigger', 'workflow', 'process', 'after-save', 'before-delete', 'after-delete', 'outside the save'];
items.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.name.localeCompare(b.name));
const notes = [];
if (!hasFlowsFolder) {
  notes.push(`No flows/ folder in ${dirs.map(rel).join(', ') || 'the package directories'}. Retrieve them first, for example: sf project retrieve start --metadata Flow ApexTrigger Workflow --target-org <alias>`);
}
for (const s of skipped) notes.push(`Could not read ${s.file}: ${s.reason}`);

const result = { object: objectName, projectDir, packageDirectories: dirs.map(rel), items: items.map(plain), fieldWriters, notes };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (!items.length) {
  console.log(`No automation on ${objectName} in this project (${flowFiles.length} flow files read).`);
  for (const note of notes) console.log(`NOTE ${note}`);
} else {
  console.log(`Automation on ${objectName} in ${projectDir}`);
  for (const stage of STAGES) {
    const inStage = items.filter((i) => i.stage === stage);
    if (!inStage.length) continue;
    console.log(`\n## ${stage}`);
    for (const i of inStage) {
      const facts = [
        i.kind,
        i.status,
        i.event && `event ${i.event}`,
        i.onlyWhenUpdatedToMeet && 'only when updated to meet the conditions',
        i.entryConditions && `entry ${i.entryConditions}`,
        i.triggerOrder !== undefined && `trigger order ${i.triggerOrder ?? 'none'}`,
        i.evaluation && `evaluation ${i.evaluation}`,
        i.start && `starts ${i.start}`,
        i.criteria && (typeof i.criteria === 'string' ? `criteria ${i.criteria}` : i.criteria.map((c) => `node "${c.node}"${c.onlyWhenChanged ? ' (only when specified changes)' : ''}`).join(', ')),
        i.events && `events ${i.events.join(', ')}`,
        i.schedule && `schedule ${i.schedule}`,
        i.paths?.length && i.paths.join(', '),
        i.calls?.length && `calls ${i.calls.join(', ')} (not read)`,
        i.otherActions?.length && `other actions ${i.otherActions.join(', ')}`,
      ].filter(Boolean);
      console.log(`- ${i.name} (${i.file}): ${facts.join(' · ')}`);
      for (const [field, how] of i.writes) console.log(`    writes ${field}: ${[...how].join('; ')}`);
    }
  }
  const shared = Object.entries(fieldWriters).filter(([, writers]) => writers.length > 1);
  console.log('\n## Fields written by more than one automation');
  console.log(shared.length ? shared.map(([field, writers]) => `- ${field}: ${writers.join(', ')}`).join('\n') : '- none');
  for (const note of notes) console.log(`\nNOTE ${note}`);
}
process.exit(hasFlowsFolder ? 0 : 2);
