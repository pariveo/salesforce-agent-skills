---
name: release-review
description: >
  Maintainers of this repository only. Reviews the salesforce-flow-modernizer
  skill against a new Salesforce release and the current official
  documentation, and writes a findings report before anything in the skill
  changes. Use when a Salesforce release or its preview release notes come
  out, when asked whether the skill is current, or to update the skill for a
  release.
---

# Release review

Each Salesforce release can add a Flow element, change a limit, move a help
page or retire a feature. The skill states all of these, so a release the
skill hasn't seen can make it recommend the wrong element or miss a better
one. This review finds those gaps and reports them. The skill itself changes
afterwards, one finding per pull request, as CONTRIBUTING.md describes.

The review never states a platform fact from memory. Every finding cites a
page on help.salesforce.com or developer.salesforce.com, or a deploy result.

## Workflow

Copy this checklist into your working notes and tick it off:

```
- [ ] 1. Read the baseline in maintenance/release.json
- [ ] 2. Confirm the target release and its API version
- [ ] 3. Read the Flow release notes of every release after the baseline
- [ ] 4. Diff the Flow schema (needs an org on the target release)
- [ ] 5. Re-check every source the skill cites
- [ ] 6. Validate the examples at the target API version (needs an org)
- [ ] 7. Classify the findings and write the report
- [ ] 8. After the changes land, move the baseline
```

Working files go in `.release-review/`, which git ignores. Name them after
the target release, for example `.release-review/winter-27.md`.

**Step 1. Baseline.** `maintenance/release.json` names the release the skill
was last reviewed against, its API version and the review date.

**Step 2. Target.** The target is the newest release whose release notes are
published on help.salesforce.com, generally available or in preview. Take
its API version from the release notes, or from "Api Version" in
`sf org display --target-org <alias>` on an org that runs it. Write both
sources into the report. If the target equals the baseline, there is no
release to review, so re-check the sources only (step 5).

**Step 3. Release notes.** Open the release notes of every release after the
baseline, up to the target. help.salesforce.com loads its content with
JavaScript, so read it in a browser, because a plain HTTP fetch can come back
empty. Read these sections:

- Flow Builder, Flow Orchestration and the other Automation sections
- New and changed metadata types, for `Flow`
- Retirements and release updates that name Flow, Process Builder or
  workflow rules
- Agentforce and Data 360 items only where they change a Flow element or
  action

List every item with its title, its URL and what it changes for a flow.

**Step 4. Schema.** Download the Metadata WSDL from an org on the target
release (Setup, API, Generate Metadata WSDL) into `.release-review/`, then:

```bash
node scripts/diff-flow-schema.mjs .release-review/metadata-<api>.wsdl --api <api>
```

It lists the Flow types, fields and enumeration values that were added,
removed or retyped since the newest snapshot in `maintenance/flow-schema/`,
and where the checker's tag lists differ from the schema. Find each addition
in the Flow page of the Metadata API Developer Guide and in the release notes
from step 3. With no snapshot yet, the script compares the checker's tag
lists only.

Use a scratch org or a sandbox, never a production org, and name it on every
`sf` command instead of relying on the CLI's default org.

**Step 5. Sources.** Write the inventory and work through it:

```bash
node scripts/source-inventory.mjs > .release-review/<release>-sources.md
```

Open each official source once and check every claim listed under it. A
page that moved, a number that changed, a renamed feature and a page that is
gone are each a finding. For each "Not verified" mark, search the
documentation again, because a new page can settle it. For each source on
another host, look for an official page that states the claim.

The maintainer script sources are the official pages CONTRIBUTING.md cites
for the maintainer scripts. They back no skill claim. Check each against the
command next to it in CONTRIBUTING.md. A mismatch is a finding against that
script or CONTRIBUTING.md, not against the skill.

**Step 6. Examples.** With an org on the target release:

```bash
node scripts/validate-examples.mjs --target-org <alias> --api <api>
```

It deploys copies of the examples raised to the target API version, as a
check-only deployment. A failure is a finding, with the exact error.

**Step 7. Findings and report.** Sort every finding into one kind:

| Kind | What it is | What it leads to |
| --- | --- | --- |
| Correction | A claim no longer matches its source | A reference edit and a CHANGELOG line |
| Retirement | An element, action or behaviour the skill recommends is deprecated or retired | A decision table or escape condition change, then the eval suite |
| New element | A newer element that replaces a legacy pattern the table doesn't cover | A candidate table row with an example, a deploy and an eval case |
| Checker | A tag the checker doesn't know, or a minimum API version it should enforce | A `check-flow.mjs` change |
| Link | A source moved or disappeared | A link update |
| No change | Checked, and the skill is still right | A line in the report, so the next review sees it was checked |

The decision table lists newer elements that replace a legacy pattern. A
long-standing practice that the release didn't change is out of scope, and so
is a feature that needs no Flow element, such as a Flow Builder UI change.

Write the report to `.release-review/<release>.md`:

```
# Release review: <target release> (API <n>.0)

Baseline: <release> (API <n>.0), reviewed <date>
Target confirmed from: <URL or command>
Org used: <alias and edition> | none (steps 4 and 6 not run)
Schema diff: <command and summary> | not run (<reason>)
Example validation: <command and result> | not run (<reason>)

## Findings

### <n>. <kind>: <one-line title>
Source: <URL or deploy result>
Affects: <file:line, ...>
Change: <what to change in the skill>
Changes a recommendation: yes (run the eval suite) | no
Needs an example deploy: yes | no

## Checked without change
- <source or release note item>
```

Don't edit the skill, the checker or the examples during the review. The
report comes first, as in the skill's own audits. Once the maintainer agrees
with the findings, each one that needs a change becomes its own pull request.

**Step 8. Move the baseline.** When every finding is either changed or
recorded as "no change", update these together in one pull request:

- `maintenance/release.json`: `release`, `apiVersion` and `reviewedOn`
- The "Currency" line in `SKILL.md`, under "Verify before asserting"
- The API version that step 2 of `SKILL.md` falls back to
- The review sentence under "Compatibility" in `README.md`
- `maintenance/flow-schema/<api>.json`, saved with
  `node scripts/diff-flow-schema.mjs .release-review/metadata-<api>.wsdl --api <api> --write`
- A CHANGELOG line under `[Unreleased]` that names the release reviewed

The smoke test fails while these disagree, and while the checker's tag lists
differ from the newest schema snapshot.
