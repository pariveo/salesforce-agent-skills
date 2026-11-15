---
name: salesforce-automation-mapper
description: >
  Lists all automation on one Salesforce object and the order it runs in,
  without changing anything. Reads a local sfdx project: record-triggered,
  schedule-triggered and platform event-triggered flows, Process Builder
  processes, workflow rules and Apex triggers. Groups them by the stage of a
  save, orders each stage by the platform's documented rules (trigger order
  bands and ties, create versus update, what a re-run does, which value is on
  the record when two automations write one field), and says what the files
  can't show. Use when asked to list, map or inventory the automation on a
  named object, or what runs when a record of that object is saved and in
  which order. Needs no org. For building, changing, auditing or migrating a
  flow, use salesforce-flow-modernizer.
---

# Salesforce automation map

Before anyone changes a flow, they need to know what else runs on the same
object and in which order. Finding the automation is easy. Getting the
platform's order rules right is where an unaided answer goes wrong. This
skill carries those rules, in [save-order.md](references/save-order.md),
and a script that lists what the metadata settles.

These rules decide most outcomes:

1. **The script lists, you order.** Every order statement cites a rule from
   save-order.md. Where no rule settles it, say so plainly, and don't fill
   the gap from creation dates, file order or API names that the rule
   doesn't use.
2. **Never edit.** This skill reads files and runs the script. It writes no
   metadata, deploys nothing, and needs no org.
3. **One object.** Map the object you were asked about. Don't rate the org,
   score the automation or list other objects. If the user wants that,
   say it is out of scope for this skill.

## Workflow

Copy this checklist into your working notes and tick it off:

```
- [ ] 1. Read the conventions file's "Order and coexistence on shared objects"
- [ ] 2. Run scripts/map-automation.mjs for the object
- [ ] 3. Read references/save-order.md
- [ ] 4. Write the inventory table by stage, with the saves each item runs on
- [ ] 5. Order each stage, citing the rule
- [ ] 6. Work out every overlap
- [ ] 7. List what isn't in this project, and the open decisions
```

**Step 1. Conventions.** Read
[org-conventions.md](../salesforce-flow-modernizer/references/org-conventions.md),
section "Order and coexistence on shared objects". A row for this object
records the trigger order the team assigned and the Apex triggers it knows
about. Compare it with what the script finds. If the file is missing, say
"No conventions file found" in the output and list no open decisions.

**Step 2. Inventory.** From the project root (the folder with
`sfdx-project.json`):

```bash
node <skill-dir>/scripts/map-automation.mjs --object <ObjectApiName> [--project-dir .]
```

Add `--json` for the same listing as JSON. The script reads every package
directory, groups the items by stage, and lists for each the facts that
decide rules 1 and 2: trigger event, "only when updated to meet", entry
conditions, trigger order, status, workflow evaluation criteria, process
start and "only when specified changes", Apex trigger events. It lists the
object's fields each item writes, and the fields more than one item writes.
It orders nothing within a stage. Inactive and draft items are listed with
their status. Leave them out of the order, and mention them once.

- No automation on the object: answer in one line, "No automation on
  `<Object>` in this project", and add the "Not in this project" section.
- No `flows/` folder: the script says so and names what to retrieve. Pass
  that on, and map only what the project holds.

**Step 3. Rules.** Read [save-order.md](references/save-order.md) in full
before you state any order. It holds the stages of a save and rules 1 to 4,
each with its source.

**Step 4. Inventory table.** One table, grouped by stage in save order:
before-save flows, Apex before triggers, Apex after triggers, workflow
rules, processes, after-save flows, after commit (asynchronous paths), then
outside the save (scheduled paths, schedule-triggered and platform
event-triggered flows). For each item: name, type, the saves it runs on
(create, update, or both, and whether only on a change into its criteria,
from rule 2), and the fields it writes.

**Step 5. Order.** Within each stage, state the order and the rule that
settles it, for example "Case_Before_Set_Owner, then Case_Before_Set_Status:
same trigger order 10, alphabetical by API name (rule 1)". Where the
metadata doesn't settle it, say so: flows without a trigger order run by
activation date, which the files don't hold. Point to Flow Trigger Explorer
for the org's own view of its record-triggered flows.

**Step 6. Overlaps.** For every field in the script's "Fields written by
more than one automation", apply rules 3 and 4: which value is on the
record at the end of a create, at the end of an update that meets the
writers' criteria, and on a later save that doesn't. Say whether a value is
replaced in the same save or only on a later one. Name every stage in which
two or more flows have no trigger order. A field written only to trace
execution is still an overlap, so list it.

**Step 7. Gaps and decisions.** List what the local files can't show, then
the rows the conventions table would need for this object.

## Deliverable

```
## Automation on <Object>
<inventory table, by stage>

## Order
<per stage: the order, and the rule that settles it, or "not settled by the metadata">

## Overlaps
<per field: the writers, and the value at the end of a create, an update, a later save>
<stages with flows that have no trigger order>

## Not in this project
<automation from installed packages; metadata that was never retrieved;
validation, duplicate and assignment rules where the project lacks them;
Apex classes and subflows that a trigger, flow or process calls; Flow
Trigger Explorer for the org's own view>

## Open decisions
<rows for the "Order and coexistence on shared objects" table | "No conventions file found">
```

Keep every claim to what the files and the rules show. Mark any statement
from a debug log as observed, as save-order.md does.

## Verify before asserting

- Currency: this skill was last reviewed against Winter '27 (API 68.0). The
  save order changes rarely but does change. On an org with a higher API
  version, check that release's notes for the order of execution, flow
  trigger order, Apex triggers, Process Builder and workflow rules before
  you rely on save-order.md.
- The project API version: `sourceApiVersion` in `sfdx-project.json`. The
  order-of-execution page has a version picker. Save-order.md cites the
  Winter '27 page, and the page notes that in API 53.0 and earlier,
  after-save flows ran after entitlement rules.
- Installed packages bring automation the project doesn't hold. Say so
  instead of calling the map complete.

## References

- [save-order.md](references/save-order.md): the stages of a save and rules 1 to 4, with sources.
- [org-conventions.md](../salesforce-flow-modernizer/references/org-conventions.md): the team's decisions, read in step 1.
- `scripts/map-automation.mjs`: the inventory (step 2).
