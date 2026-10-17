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

- Node.js. The checker, the hook and both maintainer scripts use only Node's
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

## Before you open a pull request

Run the smoke test:

```bash
node scripts/smoke-test.mjs
```

It checks the manifests, the Codex symlink, the skill's frontmatter and links,
the examples against the checker, the checker against the legacy fixture, the
eval suite's shape, and the hook's behaviour. CI runs the same script.

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

By contributing you agree that your contribution is licensed under the
[MIT licence](LICENSE) of this repository.
