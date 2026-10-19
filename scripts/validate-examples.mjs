#!/usr/bin/env node
// Deploy-validates the skill's example flows against an org, as a check-only
// deployment. Maintainers run it before changing anything in examples/:
//
//   node scripts/validate-examples.mjs --target-org <scratch-org-alias> [--api <version>]
//
// The org is never taken from the CLI default. Use a scratch org or a sandbox.
// --api deploys copies of the examples raised to that apiVersion, which a
// release review uses to check them on the new release before their
// "Verified:" lines change. Without it, the examples deploy as written.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examples = join(root, 'skills', 'salesforce-flow-modernizer', 'examples');

const args = process.argv.slice(2);
const index = args.indexOf('--target-org');
const targetOrg = index >= 0 ? args[index + 1] : undefined;
const apiIndex = args.indexOf('--api');
const api = apiIndex >= 0 ? Number(args[apiIndex + 1]) : undefined;
if (!targetOrg || (apiIndex >= 0 && !Number.isInteger(api))) {
  console.error('usage: node scripts/validate-examples.mjs --target-org <alias> [--api <version>]  (no default org is used)');
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(join(root, 'maintenance', 'release.json'), 'utf8'));
const sourceApiVersion = `${api ?? baseline.apiVersion}.0`;

const project = mkdtempSync(join(tmpdir(), 'flow-examples-'));
try {
  const source = join(project, 'force-app', 'main', 'default');
  mkdirSync(source, { recursive: true });
  cpSync(join(examples, 'flows'), join(source, 'flows'), { recursive: true });
  cpSync(join(examples, 'objects'), join(source, 'objects'), { recursive: true });
  if (api) {
    for (const file of readdirSync(join(source, 'flows'))) {
      const path = join(source, 'flows', file);
      writeFileSync(path, readFileSync(path, 'utf8').replace(/<apiVersion>[\d.]+<\/apiVersion>/, `<apiVersion>${api}.0</apiVersion>`));
    }
    console.log(`Validating the examples at apiVersion ${api}.0`);
  }
  writeFileSync(
    join(project, 'sfdx-project.json'),
    JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }], sourceApiVersion }),
  );
  const result = spawnSync(
    'sf',
    ['project', 'deploy', 'validate', '--source-dir', 'force-app', '--target-org', targetOrg, '--wait', '30'],
    { cwd: project, stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(project, { recursive: true, force: true });
}
