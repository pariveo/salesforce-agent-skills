#!/usr/bin/env node
// Checks Flow metadata (.flow-meta.xml) for legacy patterns and for shapes the
// platform rejects at deploy time. No dependencies; Node 18+.
//
//   node scripts/check-flow.mjs [--api 67] [--json] <file-or-directory>...
//
// Exit code 1 when any ERROR is found, 0 otherwise. WARNINGs need a decision,
// not necessarily a change. Every finding names the element and the fix.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------- minimal XML reader (Flow metadata has no mixed content) ----------

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
  return root.children.find((n) => n.name === 'Flow');
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const kid = (node, name) => kids(node, name)[0];
const text = (node, name) => (kid(node, name)?.text ?? '').trim();
const allText = (node) => node.text + node.children.map(allText).join(' ');

// ---------- flow model ----------

const ELEMENT_TYPES = [
  'actionCalls', 'apexPluginCalls', 'assignments', 'collectionProcessors', 'customErrors',
  'decisions', 'loops', 'recordCreates', 'recordDeletes', 'recordLookups', 'recordRollbacks',
  'recordUpdates', 'screens', 'subflows', 'transforms', 'waits', 'orchestratedStages', 'steps',
];
// From the Metadata API Developer Guide, Flow and FlowElementReferenceOrValue, API 68.0.
const FLOW_FIELDS = new Set([
  'actionCalls', 'apexPluginCalls', 'apiVersion', 'areMetricsLoggedToDataCloud', 'assignments', 'choices',
  'collectionFilterCriteria', 'collectionProcessors', 'constants', 'customErrors', 'customProperties', 'decisions',
  'description', 'dynamicChoiceSets', 'environments', 'exitRules', 'experiments', 'formulas', 'fullName', 'groups',
  'interviewLabel', 'isAdditionalPermissionRequiredToRun', 'isTemplate', 'label', 'loops', 'migratedFromWorkflowRuleName',
  'orchestratedStages', 'processMetadataValues', 'processType', 'recordCreates', 'recordDeletes', 'recordLookups',
  'recordRollbacks', 'recordUpdates', 'runInMode', 'screens', 'segment', 'stages', 'start', 'startElementReference',
  'status', 'steps', 'subflows', 'textTemplates', 'timeZoneSidKey', 'transforms', 'triggerOrder', 'variables', 'waits',
]);
const VALUE_FIELDS = new Set([
  'apexValue', 'booleanValue', 'complexValue', 'complexValueType', 'dateTimeValue', 'dateValue', 'elementReference',
  'formulaDataType', 'formulaExpression', 'numberValue', 'setupReference', 'setupReferenceType', 'sobjectValue',
  'stringValue', 'transform', 'transformValueReference',
]);
const DML = new Set(['recordCreates', 'recordUpdates', 'recordDeletes']);
const FAULTABLE = new Set(['recordCreates', 'recordUpdates', 'recordDeletes', 'recordLookups', 'actionCalls']);

function model(flow) {
  const nodes = new Map();
  for (const type of ELEMENT_TYPES) {
    for (const el of kids(flow, type)) nodes.set(text(el, 'name'), { type, el, name: text(el, 'name') });
  }
  const start = kid(flow, 'start');
  return {
    flow,
    nodes,
    start,
    apiVersion: Number(text(flow, 'apiVersion')) || 0,
    processType: text(flow, 'processType'),
    triggerType: text(start, 'triggerType'),
    recordTriggerType: text(start, 'recordTriggerType'),
  };
}

// Targets an element can hand control to. Fault connectors are excluded unless asked.
function targets(el, { fault = false } = {}) {
  const out = [];
  const add = (c) => c && text(c, 'targetReference') && out.push(text(c, 'targetReference'));
  for (const key of ['connector', 'defaultConnector', 'nextValueConnector', 'noMoreValuesConnector']) add(kid(el, key));
  if (fault) add(kid(el, 'faultConnector'));
  for (const rule of kids(el, 'rules')) add(kid(rule, 'connector'));
  for (const ev of kids(el, 'waitEvents')) add(kid(ev, 'connector'));
  return out;
}

function reachable(m, from, { stopAt = new Set(), fault = false } = {}) {
  const seen = new Set();
  const queue = [...from];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name) || stopAt.has(name) || !m.nodes.has(name)) continue;
    seen.add(name);
    queue.push(...targets(m.nodes.get(name).el, { fault }));
  }
  return seen;
}

function loopBody(m, loop) {
  const next = kid(loop.el, 'nextValueConnector');
  if (!next) return new Set();
  return reachable(m, [text(next, 'targetReference')], { stopAt: new Set([loop.name]), fault: true });
}

// ---------- checks ----------

const ID_PATTERN = /(?<![\w])(?:0[0-9A-Za-z]{2}|a[0-9][0-9A-Za-z])[0-9A-Za-z]{12}(?:[0-9A-Za-z]{3})?(?![\w])/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ESCAPE = /Escape:\s*E([1-6])\b/;

function check(m, { api }) {
  const findings = [];
  const report = (severity, code, element, message) => findings.push({ severity, code, element, message });
  const isRecordTriggered = ['RecordBeforeSave', 'RecordAfterSave', 'RecordBeforeDelete'].includes(m.triggerType);
  const beforeSave = m.triggerType === 'RecordBeforeSave';
  const afterSave = m.triggerType === 'RecordAfterSave';

  // Same-type elements must be contiguous (the Metadata API parser rejects interleaving)
  const seenTypes = new Set();
  let previous = null;
  for (const child of m.flow.children) {
    if (child.name !== previous && seenTypes.has(child.name)) {
      report('ERROR', 'FLOW016', child.name, `<${child.name}> elements are split into separate groups. Keep all elements of one type together (deploy fails: "Element ${child.name} is duplicated at this location").`);
    }
    seenTypes.add(child.name);
    previous = child.name;
  }

  // API version
  if (api && m.apiVersion && m.apiVersion < api) {
    report('ERROR', 'FLOW011', 'apiVersion', `apiVersion ${m.apiVersion} is below the org's ${api}. Set it to ${api}.0 unless compatibility requires otherwise.`);
  }
  const needs = (min, what) =>
    m.apiVersion && m.apiVersion < min && report('ERROR', 'FLOW011', 'apiVersion', `${what} needs API ${min}.0 or later; the flow is on ${m.apiVersion}.`);
  const transforms = [...m.nodes.values()].filter((n) => n.type === 'transforms');
  if (transforms.length) needs(59, 'Transform');
  if (transforms.some((t) => allText(t.el).includes('InnerJoin'))) needs(63, 'Transform join (InnerJoin)');
  if (transforms.some((t) => ['Boolean', 'Currency', 'Date', 'DateTime', 'Number', 'String'].includes(text(t.el, 'dataType')))) {
    needs(62, 'Transform with a primitive target type');
  }

  // A join's transformValueName is visible only inside the Transform that declares it
  for (const t of transforms) {
    const declared = new Set(kids(t.el, 'transformValues').map((v) => text(v, 'transformValueName')).filter(Boolean));
    const refs = [];
    const collectRefs = (node) => {
      for (const c of node.children) {
        if (c.name === 'transformValueReference') refs.push(c.text.trim().split('[')[0]);
        collectRefs(c);
      }
    };
    collectRefs(t.el);
    for (const ref of new Set(refs)) {
      if (!declared.has(ref)) {
        report('ERROR', 'FLOW017', t.name, `transformValueReference "${ref}" is not a transformValueName of this Transform. Put the InnerJoin and the Map actions that read it in the same Transform element (deploy fails: "isn't available").`);
      }
    }
  }

  // Loops
  for (const loop of [...m.nodes.values()].filter((n) => n.type === 'loops')) {
    const body = [...loopBody(m, loop)].map((name) => m.nodes.get(name));
    const escape = ESCAPE.exec(text(loop.el, 'description'))?.[1];
    for (const inner of body) {
      if (DML.has(inner.type)) {
        report('ERROR', 'FLOW001', inner.name, `${inner.type} runs inside ${loop.name}. Build the records in a collection (Transform, or Assignment in the loop) and run one DML after the loop.`);
      }
      if (inner.type === 'recordLookups') {
        report('ERROR', 'FLOW002', inner.name, `Get Records runs inside ${loop.name}. Query once before the loop, then Filter or join (Transform InnerJoin) in memory.`);
      }
    }
    const perItemCalls = body.filter((n) => ['actionCalls', 'subflows', 'apexPluginCalls'].includes(n.type));
    const onlyBookkeeping = body.every((n) => ['assignments', 'decisions'].includes(n.type));
    if (!escape) {
      const replacement = beforeSave
        ? 'In before-save flows use Collection Filter plus an Assignment with AssignCount; only a Sum needs a loop (declare Escape: E3).'
        : 'Filter-only loops become a Collection Filter; mapping, Sum and Count become a Transform; stitching two collections becomes a Transform InnerJoin.';
      report('ERROR', 'FLOW004', loop.name,
        `Loop without an escape declaration. ${onlyBookkeeping ? 'Its body is only Decision/Assignment, the legacy collection pattern. ' : ''}${replacement} If a loop is genuinely required, put "Escape: E<n> <reason>" in the loop's description (see SKILL.md).`);
    } else {
      if (escape === '1' && perItemCalls.length === 0) {
        report('WARNING', 'FLOW004', loop.name, 'Escape E1 is declared but the loop body calls no action, subflow, or Apex plugin.');
      }
      if (escape === '3' && !beforeSave) {
        report('WARNING', 'FLOW004', loop.name, 'Escape E3 applies to before-save flows only; this flow can use a Transform Sum.');
      }
    }
  }

  // Record-triggered structure
  if (isRecordTriggered) {
    const hasEntry = kids(m.start, 'filters').length > 0 || text(m.start, 'filterFormula') !== '';
    if (!hasEntry && ['Update', 'CreateAndUpdate'].includes(m.recordTriggerType)) {
      report('WARNING', 'FLOW012', 'start', 'Update-triggered flow without entry conditions runs on every save. Add filters or an entry formula (ISCHANGED / $Record__Prior).');
    }
    // A first Decision that only gates (one outcome continues, the other ends the flow) is an entry condition.
    const first = text(kid(m.start, 'connector'), 'targetReference');
    const firstNode = m.nodes.get(first);
    if (firstNode?.type === 'decisions') {
      const branches = [...kids(firstNode.el, 'rules').map((r) => kid(r, 'connector')), kid(firstNode.el, 'defaultConnector')];
      const continuing = branches.filter((c) => c && text(c, 'targetReference')).length;
      if (continuing <= 1) {
        report('WARNING', 'FLOW015', first, 'The first element is a Decision whose other outcomes end the flow. Move its condition into the entry conditions.');
      }
    }
  }
  if (beforeSave) {
    for (const t of transforms) {
      report('ERROR', 'FLOW006', t.name, 'Transform is not allowed in before-save flows (deploy fails). Keep the flow before-save: count with Collection Filter plus AssignCount, sum in a Loop declared "Escape: E3". Moving to after-save for a Transform costs a second save.');
    }
  }
  const asyncPaths = kids(m.start, 'scheduledPaths').filter((p) => text(p, 'pathType') === 'AsyncAfterCommit');
  if (asyncPaths.length > 1) report('ERROR', 'FLOW007', 'start', 'Only one AsyncAfterCommit path is allowed per flow (deploy fails).');
  for (const p of asyncPaths) {
    const extra = ['label', 'offsetNumber', 'offsetUnit', 'recordField', 'timeSource', 'maxBatchSize'].filter((f) => kid(p, f));
    if (extra.length) report('ERROR', 'FLOW007', text(p, 'name'), `The async path must not set ${extra.join(', ')} (deploy fails).`);
  }
  if (afterSave) {
    const syncPath = reachable(m, [text(kid(m.start, 'connector'), 'targetReference')].filter(Boolean));
    for (const name of syncPath) {
      const n = m.nodes.get(name);
      if (n.type === 'recordUpdates') {
        const selfUpdate = text(n.el, 'inputReference') === '$Record' ||
          kids(n.el, 'filters').some((f) => text(f, 'field') === 'Id' && text(kid(f, 'value'), 'elementReference') === '$Record.Id');
        if (selfUpdate) report('ERROR', 'FLOW005', name, 'After-save update of the triggering record re-runs the save order. Set the fields in a before-save flow instead; a Sum there is a Loop declared "Escape: E3" (SKILL.md). Needing a Transform does not justify the second save.');
      }
      if (n.type === 'actionCalls') {
        report('WARNING', 'FLOW014', name, 'Action on the synchronous after-save path. Callouts, emails and notifications belong on the asynchronous path unless a later element needs the result (escape E4).');
      }
    }
  }

  // Data access
  for (const n of m.nodes.values()) {
    if (n.type === 'recordLookups' && kids(n.el, 'queriedFields').length === 0 && kids(n.el, 'outputAssignments').length === 0) {
      report('WARNING', 'FLOW008', n.name, 'Get Records stores all fields. List the fields the flow uses in queriedFields.');
    }
    if (FAULTABLE.has(n.type) && !beforeSave && !kid(n.el, 'faultConnector')) {
      report('WARNING', 'FLOW009', n.name, 'No fault path. Route faults to the handling the org-conventions file names (or say which convention is still open).');
    }
  }

  // Screens: validation done by a Decision after the screen
  for (const screen of [...m.nodes.values()].filter((n) => n.type === 'screens')) {
    for (const next of targets(screen.el)) {
      const d = m.nodes.get(next);
      if (d?.type !== 'decisions') continue;
      const loopsBack = reachable(m, targets(d.el)).has(screen.name);
      if (loopsBack) {
        report('WARNING', 'FLOW013', d.name, `Decision after ${screen.name} routes back to it. Put input checks on the components (validationRule) instead.`);
      }
    }
  }

  // Tag names against the Metadata API reference (Flow, FlowElementReferenceOrValue; API 68.0)
  for (const child of m.flow.children) {
    if (!FLOW_FIELDS.has(child.name)) {
      report('WARNING', 'FLOW018', child.name, `<${child.name}> is not a documented Flow field. Check the tag name against the examples before deploying.`);
    }
  }
  const scanValues = (node, path) => {
    for (const c of node.children) {
      if (['value', 'rightValue', 'defaultValue'].includes(c.name)) {
        for (const v of c.children) {
          if (!VALUE_FIELDS.has(v.name)) {
            report('ERROR', 'FLOW018', path, `<${v.name}> is not valid inside <${c.name}> (deploy fails: "invalid at this location"). Use one of: ${[...VALUE_FIELDS].join(', ')}.`);
          }
        }
      }
      scanValues(c, text(c, 'name') || path);
    }
  };
  scanValues(m.flow, 'flow');

  // Hard-coded IDs
  const scan = (node, path) => {
    for (const c of node.children) {
      if (['stringValue', 'formulaExpression', 'expression', 'filterFormula', 'formula'].includes(c.name) && ID_PATTERN.test(c.text)) {
        report('WARNING', 'FLOW010', path, `Looks like a hard-coded record ID ("${ID_PATTERN.exec(c.text)[0]}"). Use a custom label, custom metadata, or a query by DeveloperName.`);
      }
      if (c.name === 'stringValue' && EMAIL_PATTERN.test(c.text)) {
        report('WARNING', 'FLOW010', path, `Hard-coded email address ("${EMAIL_PATTERN.exec(c.text)[0]}"). Use a custom label, custom metadata, or a queue or user lookup.`);
      }
      scan(c, text(c, 'name') || path);
    }
  };
  scan(m.flow, 'flow');

  return findings;
}

// ---------- CLI ----------

function collect(paths) {
  const files = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p)) files.push(...collect([join(p, entry)]));
    } else if (p.endsWith('.flow-meta.xml')) {
      files.push(p);
    }
  }
  return files;
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const apiIndex = args.indexOf('--api');
const api = apiIndex >= 0 ? Number(args[apiIndex + 1]) : undefined;
const paths = args.filter((a, i) => !a.startsWith("--") && (apiIndex < 0 || i !== apiIndex + 1));
if (paths.length === 0) {
  console.error('usage: node check-flow.mjs [--api <version>] [--json] <file-or-directory>...');
  process.exit(2);
}

const results = collect(paths).map((file) => {
  try {
    const flow = parseXml(readFileSync(file, 'utf8'));
    if (!flow) throw new Error('no <Flow> root element');
    return { file, findings: check(model(flow), { api }) };
  } catch (error) {
    return { file, findings: [{ severity: 'ERROR', code: 'FLOW000', element: 'file', message: `Cannot read: ${error.message}` }] };
  }
});

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const { file, findings } of results) {
    console.log(`${file}: ${findings.length ? '' : 'no findings'}`);
    for (const f of findings) console.log(`  ${f.severity.padEnd(7)} ${f.code} ${f.element}: ${f.message}`);
  }
}
const errors = results.flatMap((r) => r.findings).filter((f) => f.severity === 'ERROR').length;
process.exit(errors > 0 ? 1 : 0);
