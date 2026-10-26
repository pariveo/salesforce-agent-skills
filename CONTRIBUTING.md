# Contributing

Issues are welcome from everyone. The most useful ones report a Flow element
whose behaviour has changed, or a Salesforce release note that changes an
escape condition. Use the issue forms. A pattern request asks for the
Salesforce documentation link, because every row in the decision table rests
on one.

Pull requests are open to Pariveo maintainers only. If you have a fix, describe
it in an issue, with the source or deploy result behind it, and a maintainer
will make the change. You can still fork the repository and change your copy
under the [MIT licence](LICENSE).

The rest of this file is for maintainers.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## What you need

- Node.js. The checker, the hook and the maintainer scripts use only Node's
  standard library, so there's nothing to install.
- Salesforce CLI and a scratch org, if you change anything under
  `skills/salesforce-flow-modernizer/examples/`.

## Rules for content

An agent acts on every sentence in the skill files, so a wrong claim there
turns into a wrong flow.

- Every platform claim has a source: a page on help.salesforce.com or
  developer.salesforce.com, or a deploy result from an example. Mark anything
  you couldn't verify as unverified. Don't state availability, limits, GA
  status or deprecations from memory.
- `SKILL.md` stays at or under 250 lines. The decision table and the escape
  conditions belong there, and detail goes into `references/`. The smoke test
  enforces the limit.
- Examples use standard objects and `example.com` addresses, with no customer,
  employer or org names and no record IDs.
- `references/org-conventions.md` ships with every slot unset. Fill it in
  your fork or your own project, never here.

## Code comments

These rules cover every `.mjs`, `.js` and `.sh` file. The header comment of
an example flow is content, so "Changing an example" below covers it instead.

- Default to no comment. Names say what the code does, so a comment says
  only why. That means a platform behaviour, a rejected alternative or a
  choice a later edit would otherwise undo, in one or two lines.
- A file opens with a short header that says what it does and how to run it.
  The reasoning behind its design belongs in Markdown.
- No links in code comments. A platform claim and its source go in Markdown.
  A skill claim goes in `SKILL.md` or the reference that owns it, and a
  maintainer script's claim goes in this file, next to the command. The
  comment can name that file. `scripts/source-inventory.mjs` reads the skill's
  Markdown, the example flows and this file, never a script, so a page cited
  only in a comment drops out of every release review.
- Don't restate what another file owns, such as a value, a flag list or the
  checks a script runs. Name the owner.
- Don't narrate the change with "now", "previously" or "added for". The
  commit message and the changelog hold that.
- In a file you edit, delete commented-out code and any comment the code has
  outgrown.

The smoke test fails on a link in a code comment, and on a comment block
longer than 8 lines, the header included.

## Changing an example

Every `.flow-meta.xml` under `examples/` is deployed to a scratch org before
it's added or changed. Name the org on every `sf` command and never rely on
the CLI's default org:

```bash
node scripts/validate-examples.mjs --target-org <scratch-org-alias>
```

The script runs a check-only deployment, so it leaves nothing behind in the
org. Keep the `Verified:` line in the example's header comment true. It names
the org API version the example was deployed on, and whether it also ran
against data.

## Release reviews

Each Salesforce release can add a Flow element, change a limit, move a help
page or retire a feature, and the skill states all of these. A release review
checks the skill against the release and the current documentation, and
reports what has to change before anything does.

Run one when a release's preview release notes are published, and again at
general availability if the notes changed in between. In Claude Code or
Codex, ask for the `release-review` skill. It lives in `.claude/skills/`, and
Codex finds it through `.agents/skills/`. It is a maintainer skill and isn't
part of the plugin. It walks through these steps:

- `maintenance/release.json` names the release the skill was last reviewed
  against. `SKILL.md` and the README state the same release, and the smoke
  test fails when they disagree.
- The release notes of every release since then, read in a browser.
- `node scripts/diff-flow-schema.mjs <metadata.wsdl> --api <version>`
  compares the Flow part of an org's Metadata WSDL with the snapshot in
  `maintenance/flow-schema/`, and reports where the checker's tag lists
  differ from the schema.
- `node scripts/source-inventory.mjs` lists every source the skill cites,
  with each claim that cites it, and every "Not verified" mark. In a group of
  their own, it lists the help.salesforce.com and developer.salesforce.com
  pages this file cites for the maintainer scripts. This file's other links
  back no platform claim, so the inventory leaves them out.
- `node scripts/validate-examples.mjs --target-org <alias> --api <version>`
  deploy-validates the examples raised to the new API version. It runs
  `sf project deploy start --dry-run --test-level NoTestRun`, so the result
  depends only on the examples and not on the org's own Apex test coverage.
  `sf project deploy validate` always runs Apex tests, by default every local
  test, and fails on an org with uncovered Apex even when every example
  deploys. NoTestRun applies only to development environments such as sandbox,
  Developer Edition or trial orgs, so name a scratch org or a sandbox
  ([project deploy start](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_deploy_start.html),
  [project deploy validate](https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_deploy_validate.html)).

The review writes its report to `.release-review/`, which git ignores. Each
finding that needs a change becomes its own pull request. The last one moves
the baseline in `maintenance/release.json`.

## Before you open a pull request

Run the smoke test:

```bash
node scripts/smoke-test.mjs
```

It checks the manifests, the Codex symlink, the skill's frontmatter and links,
the examples against the checker, the checker against the legacy fixture, the
release baseline and the review scripts against the skill, the deploy command
`validate-examples.mjs` runs, the release and release notes scripts on a
copy of the manifests and changelog, the eval suite's shape, the hook's behaviour, and
the code comments. CI runs the same script.

If you changed `SKILL.md` or a reference, consider running the eval suite as
well. It needs a Claude Code build with `plugin eval`, and
[evals/README.md](evals/README.md) explains how.

## Commits and pull requests

- One change per pull request. A fixed example and an unrelated wording change
  are two pull requests.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/),
  for example `fix(skill): take the trigger event from the requirement`. The
  scopes in use are `skill`, `plugin` and `evals`. Mark a breaking change
  with `!`.
- Add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) when users
  will notice the change. The changelog says what counts as breaking.
- Fill in the pull request template: what changed, the deploy result for any
  example you touched, and the smoke test result.

## Releasing

A change to the skill reaches users only through a release. Claude Code
keeps an installed plugin on the `version` in its manifest until that version
changes
([plugin manifest reference](https://code.claude.com/docs/en/plugins-reference#version)),
so merged changes stay invisible to existing installs until the next release.

To cut a release in one step, run the VS Code task "Release"
(`.vscode/tasks.json`), or:

```bash
node scripts/cut-release.mjs
```

It works from any checkout and branch, because it cuts the release branch
`chore/release-<version>` from `origin/main` in a temporary worktree. There it
runs `scripts/release.mjs` and the smoke test, commits, pushes and opens the
pull request. It squash-merges the pull request once its required checks
pass, then waits for the `release` workflow and prints the release URL. It
asks before it changes anything, and `--yes` skips the question.

- **The version.** A breaking change raises the major version, or the minor
  version below 1.0.0. It counts as breaking when a commit since the last tag
  is marked with `!` or a `BREAKING CHANGE:` footer, or when `[Unreleased]`
  has a `### Removed` section. Otherwise an `### Added` section raises the
  minor version and anything else the patch. Check the result against the
  rules at the top of [CHANGELOG.md](CHANGELOG.md), and pass `patch`,
  `minor`, `major` or a version to override it.
- **A dry run**, `--dry-run` or the task "Release (dry run)", prints the next
  version and its release notes and changes nothing.
- **A re-run resumes.** When a release pull request is still open, it waits
  for its checks and merges it instead of starting another.

The steps it runs can also be taken by hand. Choose the version, then run:

```bash
node scripts/release.mjs <version>
```

It sets the version in `.claude-plugin/plugin.json` and
`.codex-plugin/plugin.json`, moves the `[Unreleased]` entries under a heading
for that version with today's date, and updates the comparison links at the
bottom of the changelog. `--date YYYY-MM-DD` sets another date. It refuses a
version that isn't newer, and an empty `[Unreleased]`.

Commit the result as `chore(plugin): release <version>` and open a pull
request. When it merges, the `release` workflow in
`.github/workflows/release.yml` tags the merge commit `v<version>` and
publishes a GitHub release titled `Salesforce agent skills <version>`. The
release notes are that version's changelog section, which
`node scripts/release-notes.mjs <version>` prints, so you can preview them
before the merge.

The workflow runs only when a push to `main` changes
`.claude-plugin/plugin.json`, and does nothing when the version already has a
release, so an edit to the manifest's other fields publishes nothing. If a run
fails, fix the cause and re-run the failed job. A re-run tags the same merge
commit, while a later push would tag a later one. Don't tag by hand, and
don't use `claude plugin tag`, which names the tag `<plugin>--v<version>`
instead.

By contributing you agree that your contribution is licensed under the
[MIT licence](LICENSE) of this repository.
