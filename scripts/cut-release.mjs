#!/usr/bin/env node
// Cuts a release from origin/main in one run: picks the version, runs
// release.mjs and the smoke test in a temporary worktree, opens the release
// pull request, merges it once its required checks pass, and waits for the
// release workflow to publish. A re-run resumes an open release pull request.
// CONTRIBUTING.md, "Releasing", has the version rule and the steps.
//
//   node scripts/cut-release.mjs [auto|patch|minor|major|<x.y.z>] [--dry-run] [--yes]

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH_PREFIX = 'chore/release-';
const VERSION = /^\d+\.\d+\.\d+$/;
const USAGE = 'usage: node scripts/cut-release.mjs [auto|patch|minor|major|<x.y.z>] [--dry-run] [--yes]';

export const BUMPS = ['patch', 'minor', 'major'];

// A removed entry counts as breaking, since a removed checker rule is one
export function bumpFor({ version, unreleased, commits }) {
  const breaking =
    /^### Removed$/m.test(unreleased) ||
    commits.some(({ subject, body }) => /^\w+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(body));
  if (breaking) return version.startsWith('0.') ? 'minor' : 'major';
  return /^### Added$/m.test(unreleased) ? 'minor' : 'patch';
}

export function nextVersion(version, bump) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

class Failure extends Error {}
// A throw, not process.exit, so the finally that removes the worktree runs
const fail = (message) => {
  throw new Failure(message);
};
const step = (message) => console.log(`\n> ${message}`);
const sleep = (seconds) => new Promise((done) => setTimeout(done, seconds * 1000));

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} failed (exit ${result.status ?? result.signal})`);
};
const read = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const succeeds = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'ignore' }).status === 0;

function parseArgs(argv) {
  const options = { target: 'auto', dryRun: false, yes: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === 'auto' || BUMPS.includes(arg) || VERSION.test(arg)) options.target = arg;
    else fail(`unknown argument ${arg}\n${USAGE}`);
  }
  return options;
}

async function confirm({ yes }, question) {
  if (yes) return true;
  if (!process.stdin.isTTY) fail('Nothing can confirm the release outside a terminal. Pass --yes to release without asking.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`\n${question} [y/N] `);
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

function commitsSince(tag) {
  return read('git', ['log', `${tag}..origin/main`, '--format=%s%x1f%b%x1e'])
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body = ''] = record.split('\x1f');
      return { subject: subject.trim(), body: body.trim() };
    });
}

function pullRequestBody(version, notes) {
  return `## What changed

Releases ${version}. \`scripts/cut-release.mjs\` ran \`scripts/release.mjs ${version}\`, which set the version in both plugin manifests and moved the \`[Unreleased]\` entries of CHANGELOG.md under ${version}. When this merges, the release workflow tags the merge commit \`v${version}\` and publishes these notes:

${notes}

## Sources

None. This pull request changes no platform claim.

## Example deploy result

No example touched.

## Smoke test

\`\`\`
smoke test passed
\`\`\`

- [x] \`CHANGELOG.md\` has an entry under \`[Unreleased]\`, if users will notice the change (the entries, now under ${version})
`;
}

async function waitForRequiredChecks(number) {
  // gh reports no checks for the first seconds after a pull request opens
  for (let attempt = 0; attempt < 24; attempt++) {
    const listed = spawnSync('gh', ['pr', 'checks', number, '--required', '--json', 'name'], { cwd: root, encoding: 'utf8' });
    if (listed.status === 0 && JSON.parse(listed.stdout || '[]').length > 0) {
      run('gh', ['pr', 'checks', number, '--required', '--watch', '--fail-fast', '--interval', '5']);
      return;
    }
    await sleep(5);
  }
  fail(`No required check reported on #${number} within two minutes. Run this again once it has.`);
}

async function waitForReleaseRun(sha) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const id = read('gh', ['run', 'list', '--workflow', 'release.yml', '--commit', sha, '--json', 'databaseId', '--jq', '.[0].databaseId // empty']);
    if (id) return id;
    await sleep(5);
  }
  fail(`The release workflow did not start for ${sha} within two minutes. Check the Actions tab.`);
}

async function land(number, version) {
  step(`Waiting for the required checks on #${number}`);
  await waitForRequiredChecks(number);
  step(`Squash-merging #${number}`);
  run('gh', ['pr', 'merge', number, '--squash', '--subject', `chore(plugin): release ${version} (#${number})`]);
  const sha = read('gh', ['pr', 'view', number, '--json', 'mergeCommit', '--jq', '.mergeCommit.oid']);
  step('Waiting for the release workflow to tag and publish');
  const id = await waitForReleaseRun(sha);
  const watched = spawnSync('gh', ['run', 'watch', id, '--exit-status', '--interval', '5'], { cwd: root, stdio: 'inherit' });
  if (watched.status !== 0) fail(`The release workflow failed. Fix the cause and re-run its failed job: gh run rerun ${id} --failed`);
  console.log(`\nReleased ${version}: ${read('gh', ['release', 'view', `v${version}`, '--json', 'url', '--jq', '.url'])}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!succeeds('gh', ['auth', 'status'])) fail('gh is not signed in. Run: gh auth login');
  step('Fetching origin');
  run('git', ['fetch', 'origin', '--tags', '--prune', '--quiet']);

  const open = JSON.parse(read('gh', ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,url'])).find(({ headRefName }) =>
    VERSION.test(headRefName.slice(BRANCH_PREFIX.length)) && headRefName.startsWith(BRANCH_PREFIX),
  );
  if (open) {
    const version = open.headRefName.slice(BRANCH_PREFIX.length);
    console.log(`\nRelease ${version} is already open as ${open.url}`);
    if (options.dryRun) return console.log('Would wait for its required checks, merge it, and wait for the release workflow.');
    if (!(await confirm(options, `Merge it once its checks pass?`))) return console.log('Cancelled.');
    return land(String(open.number), version);
  }

  const current = JSON.parse(read('git', ['show', 'origin/main:.claude-plugin/plugin.json'])).version;
  if (!succeeds('gh', ['release', 'view', `v${current}`])) {
    fail(`${current} is on main but has no GitHub release. Look at the latest run of: gh run list --workflow release.yml`);
  }
  const changelog = read('git', ['show', 'origin/main:CHANGELOG.md']);
  const unreleased = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|^\[Unreleased\]:)/m)?.[1].trim();
  if (!unreleased) return console.log('\nNothing to release: CHANGELOG.md on main has nothing under [Unreleased].');

  const commits = commitsSince(`v${current}`);
  const bump = options.target === 'auto' ? bumpFor({ version: current, unreleased, commits }) : options.target;
  const version = VERSION.test(bump) ? bump : nextVersion(current, bump);
  const branch = `${BRANCH_PREFIX}${version}`;
  const how = options.target === 'auto' ? `${bump}, from [Unreleased] and the commits` : 'as given';
  console.log(`\n${current} -> ${version} (${how}), ${commits.length} commits since v${current}\n\n${unreleased}`);

  if (options.dryRun) {
    console.log(`\nDry run. A release would:
  1. run release.mjs ${version} and the smoke test on ${branch}, cut from origin/main
  2. push it and open a pull request
  3. squash-merge it once the required checks pass
  4. wait for the release workflow to tag v${version} and publish the notes above`);
    return;
  }
  if (!(await confirm(options, `Release ${version}?`))) return console.log('Cancelled.');
  if (succeeds('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) fail(`A local branch ${branch} exists. Delete it, then run this again.`);
  if (succeeds('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch])) {
    fail(`origin has a branch ${branch} with no open pull request. Delete it (git push origin --delete ${branch}), then run this again.`);
  }

  const worktree = mkdtempSync(join(tmpdir(), 'cut-release-'));
  const inWorktree = { cwd: worktree };
  let number;
  try {
    step(`Preparing ${branch} from origin/main`);
    run('git', ['worktree', 'add', '--quiet', '--no-track', '-b', branch, worktree, 'origin/main']);
    run(process.execPath, [join(worktree, 'scripts/release.mjs'), version], inWorktree);
    run(process.execPath, [join(worktree, 'scripts/smoke-test.mjs')], inWorktree);
    run('git', ['commit', '--quiet', '--all', '--message', `chore(plugin): release ${version}`], inWorktree);
    step(`Pushing ${branch} and opening the pull request`);
    run('git', ['push', '--quiet', '--set-upstream', 'origin', branch], inWorktree);
    const notes = read(process.execPath, [join(worktree, 'scripts/release-notes.mjs'), version], inWorktree);
    const url = read('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `chore(plugin): release ${version}`, '--body', pullRequestBody(version, notes)], inWorktree);
    console.log(url);
    number = url.split('/').pop();
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
    rmSync(worktree, { recursive: true, force: true });
    spawnSync('git', ['branch', '--quiet', '-D', branch], { cwd: root, stdio: 'ignore' });
  }
  await land(number, version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`\n${error instanceof Failure ? error.message : error.stack}`);
    process.exit(1);
  });
}
