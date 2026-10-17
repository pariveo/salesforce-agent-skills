#!/usr/bin/env node
// PreToolUse guard: reminds Claude Code to load the matching skill before it
// writes Flow metadata in an sfdx project. Reads the hook event JSON on stdin,
// emits additionalContext on a match, stays silent otherwise, and never blocks
// (always exits 0). Claude Code only: Codex does not run hooks.

const SKILLS = {
  flows: 'salesforce-flow-modernizer',
};

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = String(JSON.parse(raw)?.tool_input?.file_path ?? '');
  } catch {
    return; // malformed event: stay silent, never block
  }
  const match = filePath.match(/(?:^|\/)([^/]+)\/main\/default\/([^/]+)\//);
  const skill = match ? SKILLS[match[2].toLowerCase()] : undefined;
  if (!skill) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `Target path is Salesforce ${match[2]} metadata (${match[1]} package). ` +
          `Before writing anything, invoke the ${skill} skill via the Skill tool ` +
          `and apply its modern-first pass to the design.`,
      },
    }),
  );
});
