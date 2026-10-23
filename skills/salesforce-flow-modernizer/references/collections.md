# Collections: Filter, Sort, Transform, bulk DML, loops

## Contents

- Collection Filter
- Collection Sort
- Transform: map, sum and count, join
- Where each element is allowed
- Bulk DML
- When a loop is right
- Deploy errors seen

Examples: `Opportunity_Create_Followup_Tasks` (Filter, Sum, Count, Map, one
Create), `Opportunity_Create_Account_Tasks_Joined` (join),
`Account_Before_Save_Count_Contacts` (before-save count),
`Opportunity_Allocate_Budget_Waterfall` (Sort and a declared loop).

## Collection Filter

Keeps the items of any collection (records, primitives, Apex-defined) that
match. The source collection is unchanged, and later elements reference the
output by the element name.

- Conditions reference a per-item variable named
  `currentItem_<FilterName>`, declared as a flow variable of the item type and
  named in `assignNextValueToReference`. Flow Builder creates it, but when
  writing XML, declare it yourself.
- Formula mode: `conditionLogic` `formula_evaluates_to_true` plus
  `<formula>`, referencing `{!currentItem_<FilterName>.Field}`. The Metadata
  API reference says `Formula`, while the platform stores
  `formula_evaluates_to_true` (retrieved from a deployed flow).

```xml
<collectionProcessors>
    <name>Filter_Due_Soon</name>
    <label>Filter Due Soon</label>
    <locationX>0</locationX>
    <locationY>0</locationY>
    <assignNextValueToReference>currentItem_Filter_Due_Soon</assignNextValueToReference>
    <collectionProcessorType>FilterCollectionProcessor</collectionProcessorType>
    <collectionReference>Get_Open_Opportunities</collectionReference>
    <conditionLogic>formula_evaluates_to_true</conditionLogic>
    <connector>
        <targetReference>Next_Element</targetReference>
    </connector>
    <formula>{!currentItem_Filter_Due_Soon.Amount} &gt;= {!minAmount} &amp;&amp; {!currentItem_Filter_Due_Soon.CloseDate} &lt;= TODAY() + 30</formula>
</collectionProcessors>
```

**Collection Filter Criteria resource (Winter '27, rolling out from September
2026,
[release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_collection_filter_criteria.htm&release=264&type=5)).**
A resource type, not an element. It filters a collection and can sort the
matches in the same step. On records that contain related records, such as an
Apex-defined type, it can also filter on child relationships. An Assignment
element then builds a collection from it. The decision table doesn't use it
yet, because the Metadata API reference for API 68.0 lists the Flow field
`collectionFilterCriteria` as reserved for future use and documents none of
its fields ([Flow, Metadata API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)).
Not verified: its metadata shape, the lowest org API version that has it, and
whether a flow using it deploys.

## Collection Sort

`SortCollectionProcessor` with `sortOptions` (`sortField`, `sortOrder`,
`doesPutEmptyStringAndNullFirst`) and optional `limit`. It sorts the input
collection in place, so later elements keep referencing the original
collection (verified in the waterfall example, which allocates in sorted
order).

## Transform

One Transform produces one target: a record or record collection, an
Apex-defined type, or (org API 62+) a primitive. It maps, aggregates, and
joins. It does not filter or sort, so put a Filter or Sort before it.

**Map.** `transformValueActions` with `transformType` `Map`,
`outputFieldApiName`, and a `value` that is one of:

- `elementReference` to `<Source>[$EachItem].<Field>`
- `formulaDataType` + `formulaExpression` using `{!<Source>[$EachItem].<Field>}`,
  with `IF()` here for per-item conditional values
- a constant (`stringValue`, `numberValue`, `booleanValue`)

**Sum and Count.** `transformType` `Sum` or `Count` with `inputParameters`
named `aggregationValues` (the collection) and, for Sum, `aggregationField`
(the field API name as a `stringValue`). Target `dataType` Number or Currency,
`isCollection` false. No other aggregate functions exist
([Sum or Count Items in Collections](https://help.salesforce.com/s/articleView?id=platform.flow_build_logic_transform_sum_or_count.htm&type=5)).

**Join (org API 63+,
[Spring '25 release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_transform_join.htm&release=254&type=5)).** Inner join of two collections on one or more keys, in
a single Transform element that holds both the join and the mapping. The join
name is visible only inside that element, so a second Transform cannot read
it (deploy error, checker FLOW017).

- First `transformValues`: one `InnerJoin` action whose `inputParameters`
  entry is named `Table`, with `complexValueType` `JoinDefinition` and a
  `complexValue` JSON of `leftElementReference`, `leftJoinKeys`,
  `leftSelectedFields`, `rightElementReference`, `rightJoinKeys`,
  `rightSelectedFields`. Give this `transformValues` a `transformValueName`.
- Second `transformValues`: Map actions whose value is
  `<transformValueReference><transformValueName>[$EachItem].LeftTable.<Field></transformValueReference>`
  (or `.RightTable.`).
- Only fields listed in the selected-fields arrays can be mapped. Formulas
  cannot reference joined rows (deploy error), so map fields directly.
- Rows without a match on both sides are dropped (verified).
- The Metadata API reference calls `transformValueName` and
  `transformValueReference` reserved and documents no JoinDefinition keys. The
  example was verified by deploy and run. When in doubt, build one join in
  Flow Builder, retrieve it, and copy its shape.
- Documented limits: mapping supports up to one nested collection, and a
  nested collection can't be joined. Each source stays under 700 records on
  the synchronous path and under 1,500 on asynchronous or scheduled paths
  ([Transform Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_transform.htm&type=5)).

## Where each element is allowed

| Flow | Filter | Sort | Transform | Loop |
| --- | --- | --- | --- | --- |
| Screen, autolaunched, after-save, scheduled paths | yes | yes | yes | yes |
| Before-save | yes (verified) | yes (verified) | no (deploy error) | yes |

In before-save flows, count with Filter + Assignment operator `AssignCount`
(`Account_Before_Save_Count_Contacts`). A Sum there is escape E3. Before-save
outranks Transform, so do not move a same-record value to after-save to reach
a Transform (record-triggered.md, "Before-save or after-save").

## Bulk DML

Prepare the full collection (Transform, or Assignment `Add` inside a declared
loop), then run one Create Records, Update Records or Delete Records element
on it with `inputReference`. Adding a record variable to a collection in a
loop adds a copy (verified with four distinct tasks from one variable). DML or Get Records inside a loop has no escape.

`AssignCount` also counts a Get Records result directly, without Filter or
Transform, when every returned record counts.

## When a loop is right

Only under escape E1, E2 or E3 (SKILL.md), declared in the loop's
description: `Escape: E2 cross-item state. <reason>`. Loop over an explicit
variable (`assignNextValueToReference`) when formulas need the current item's
fields, because formulas could not read fields through the loop's automatic
output when the loop iterated after a Sort (deploy error). Assignment values
take an `elementReference` or a constant, not an inline formula, so declare a
`formulas` resource and reference it, as the waterfall example does. The checker rejects
invented value tags such as `<formulaValue>` (FLOW018). Keep DML and queries
outside the loop even then.

## Deploy errors seen

| Message (abridged) | Cause | Fix |
| --- | --- | --- |
| A flow can't include Transform elements when TriggerType is set to Record—Run Before Save | Transform in before-save | Stay before-save: Filter + `AssignCount` for a count, a Loop under E3 for a Sum |
| The formula expression for "…" target field … is invalid: Field `<Join>[$EachItem].RightTable.X` does not exist | Formula over a joined row | Map with `transformValueReference` |
| An unexpected error occurred. Please include this ErrorId … | Malformed `JoinDefinition` JSON | Copy the example's keys exactly |
| The "X" value in the "X[$EachItem].LeftTable.Id" transformValueReference isn't available | Join and mapping split across two Transform elements | One Transform holding both `transformValues` |
| The formula expression is invalid: Field `Loop_X.Field` does not exist | Formula through a loop's automatic output | Explicit loop variable |
