#!/usr/bin/env node
// PreToolUse guard: reminds the agent to load the matching skill before it
// writes Flow metadata in an sfdx project. Reads the hook event JSON on stdin:
// a Claude Code Write or Edit names its target in tool_input.file_path, and a
// Codex apply_patch carries the patch text in tool_input.command. Emits
// additionalContext on a match, stays silent otherwise, and never blocks
// (always exits 0).

const SKILLS = {
  flows: 'salesforce-flow-modernizer',
};

const SFDX_PATH = /(?:^|\/)([^/]+)\/main\/default\/([^/]+)\//;

// A moved file is written at its "Move to" path, so that replaces the
// "Update File" path. A deleted file is never a write.
const patchDestinations = (patch) => {
  const paths = [];
  for (const line of patch.split(/\r?\n/)) {
    const header = line.match(/^\*\*\* (Add File|Update File|Move to): (.+?)\s*$/);
    if (!header) continue;
    if (header[1] === 'Move to') paths[paths.length - 1] = header[2];
    else paths.push(header[2]);
  }
  return paths.filter(Boolean);
};

const writeTargets = (event) => {
  const input = event?.tool_input ?? {};
  if (event?.tool_name === 'apply_patch' && typeof input.command === 'string') {
    return { codex: true, paths: patchDestinations(input.command) };
  }
  return { codex: false, paths: [String(input.file_path ?? '')] };
};

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let targets;
  try {
    targets = writeTargets(JSON.parse(raw));
  } catch {
    return; // malformed event: stay silent, never block
  }
  for (const path of targets.paths) {
    const match = path.match(SFDX_PATH);
    const skill = match ? SKILLS[match[2].toLowerCase()] : undefined;
    if (!skill) continue;

    const load = targets.codex ? `load the ${skill} skill` : `invoke the ${skill} skill via the Skill tool`;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext:
            `Target path is Salesforce ${match[2]} metadata (${match[1]} package). ` +
            `Before writing anything, ${load} ` +
            `and apply its modern-first pass to the design.`,
        },
      }),
    );
    return;
  }
});
