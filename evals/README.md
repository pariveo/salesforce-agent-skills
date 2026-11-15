# Eval suite

Public scenarios that check what an agent builds with the skill loaded, in the
`claude plugin eval` format. Each case is a directory with `prompt.md`, the
request as a user would type it, and `graders/`, which holds the pass or fail
checks.

| Case | What it checks |
| --- | --- |
| `filter-transform-rollup` | Filter + Transform Sum and Map + one Create, no loop |
| `before-save-field-update` | Same-record update before save, change-gated, no Update of `$Record` |
| `before-save-count` | Count in before-save with Filter + `AssignCount`, with no Transform (deploy error) and no loop |
| `before-save-sum` | Sum on the triggering record stays before-save in a Loop declared `Escape: E3`, with no Transform and no Update of `$Record` |
| `update-only-trigger` | Only a change into the condition counts, so the flow starts on update only (or excludes `ISNEW()`) and creates a Task |
| `screen-reactive-order` | Record choice set, reactive total on one screen, component validation, visibility rule, `recordId` |
| `scheduled-reminder` | Scheduled path with a −30 day offset on `EndDate`, not a polling schedule-triggered flow |
| `wait-for-event` | Wait element on a platform event, resume filter as `inputParameters` |
| `transform-join` | Transform InnerJoin of two collections, join and mapping in one Transform, one Create, no loop |
| `filter-criteria-first-match` | Collection Filter Criteria resource sorted on `CloseDate` picks one record, one Create, no loop |
| `loop-with-escape` | A loop that is right (sequence numbers) is kept and declared `Escape: E2`, with one Update |
| `audit-legacy-flow` | Audit of a seeded legacy flow: DML in the loop ranked first, replacements named, file untouched |
| `map-account-create` | Map of the Account fixture on a create: before-save flows in trigger order with the API-name tie-break, workflow rules and the process before the after-save flows, create-only and update-only flows told apart |
| `map-revenue-update` | An update into a workflow rule's criteria: the field update re-runs the Apex triggers but no flow, re-evaluation fires the second rule, and the values Rating and Site end with |
| `map-field-overlap` | Fields more than one automation writes, and the value each ends with after a create |
| `map-no-automation` | An object with no automation gets a short answer and nothing invented |

Regex graders read the produced flow file, so their verdicts are exact. They
can't prove the file deploys, because a join split across two Transforms, or
an invented value tag, passes every regex and still fails deployment. The
`ran-checker` indicator, which records whether the agent ran `check-flow.mjs`,
sits beside them for that reason. The `skill-fired` grader reports whether the
skill was invoked, and Claude Code keeps it out of the score so the
with-plugin and without-plugin arms stay comparable. The two `llm` graders in
the audit case judge the final answer.

The four `map-` cases are for `salesforce-automation-mapper`. Their setup
script copies the project in `fixtures/account-automation/` into the
workspace. That project was deployed and its saves were traced in a scratch
org, and its README records the deploy result and what the debug logs
showed, which is what the graders check. Besides `skill-fired`, each case
has a `core-not-loaded` indicator: it fails when the run also loads
`salesforce-flow-modernizer`, which would mean the two descriptions
overlap. `no-edit` and `no-write` check that no project file changed.

## Run

From the repository root, with a Claude Code build that has `plugin eval`
generally available (`claude update` if it reports early access):

```bash
claude plugin eval . --scaffold --allow-tools Write Edit "Bash(node *)" --no-publish
```

- `--scaffold` runs each case's `setup.sh`, which copies its fixture into
  the run's workspace: `audit-legacy-flow` and the four `map-` cases have
  one.
- `Bash(node *)` lets the agent run the skills' scripts, `check-flow.mjs`
  and `map-automation.mjs`. No run needs an org, and the prompts say none is connected.
- Each case runs three times with the plugin and three times without it.
  The difference (Δ) is what the skill contributes. Add `--runs 1 --ablation
  none` for a quick, cheaper pass, `--tag smoke` for the four core cases,
  `--tag map` for the four mapper cases, and
  `--model` to compare models. Anthropic's
  [skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  recommend testing a skill with every model you plan to use it with.
- The agent runs the checker from the plugin directory. If the run's sandbox
  can't read it, that step fails and the agent says so. No grader depends on
  it.
- Results land in `evals/results/`, which is git-ignored.

The deterministic checks run in CI through `node scripts/smoke-test.mjs` and
cost nothing. They confirm that the example flows pass the checker, that the
checker catches the legacy fixture, that the mapper script lists the Account
fixture's automation and overlaps, and that every case is well-formed.
