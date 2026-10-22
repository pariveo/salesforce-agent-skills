# Screens: choices, reactivity, validation, screen actions, embedding

## Contents

- Screen flow contract
- Choice sets
- Reactive screens
- Component validation
- Screen actions and the Action Button
- Embedding surfaces

Examples: `Account_Order_Entry_Screen` (contract, record and picklist choice
sets, reactive total, visibility, validation), `Account_Check_Pipeline_Screen`
with `Account_Count_Open_Opportunities` (screen action).

## Screen flow contract

A screen flow embedded on a record page, quick action, utility bar or
Experience Cloud page declares what it takes and returns:

- `recordId` (String, input) receives the record from record pages and quick
  actions.
- Explicit output variables for anything the host reads back.
- Name the embedding surface in the build spec and check it in review,
  because it gates which components work (below).

## Choice sets

All dynamic choices are `dynamicChoiceSets` in metadata. Flow Builder calls
them by what they read:

| Builder name | Metadata | Notes |
| --- | --- | --- |
| Record Choice Set | `object`, `displayField`, `valueField`, `filters`, `sortField`, `limit` | Default and maximum 200 choices. `outputAssignments` copies fields of the selected record. |
| Picklist Choice Set | `picklistObject`, `picklistField`, `dataType` Picklist or Multipicklist | `displayField` and `object` nil. |
| Collection Choice Set | `collectionReference` to a record collection | Options from a collection the flow already holds (org API 54+). |

There is no "Choice Collection" resource. Static options use `choices`
(`FlowChoice`). Checkbox Group and Multi-Select Picklist accept record choice
sets. For long lists, the Choice Lookup component searches instead of
listing. It loads 20 options, then groups of 100, up to 1,020. It supports
multi-select (up to 25) since Winter '25
([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_choice_lookup.htm&release=252&type=5)),
takes text values only, and is not supported on mobile
([Choice Lookup](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_screencmp_choice_lookup.htm&type=5)).

## Reactive screens

GA since org API 59. On the same screen, formulas, Display Text,
`visibilityRule` and component attributes re-evaluate as the user types,
without a Next round trip.

- Reactive components include Text, Number, Currency, Date, Date/Time, Email,
  Long Text Area, Checkbox, Toggle, Slider, Picklist, Radio Buttons,
  Multi-Select Picklist, Choice Lookup, Lookup, Data Table, Display Text,
  Address, Visual Picker, custom LWCs, and Repeater (with limits).
- Not reactive: Display Image, File Upload, Aura components, record choice
  sets, values from manually assigned component outputs, record fields on
  screens ([Reactive Screen Flow Components](https://help.salesforce.com/s/articleView?id=platform.flow_build_reactive_screen_flow_components.htm&type=5)).
  Labels and help text do not react. `$Flow` is the only reactive global
  variable ([Considerations for Reactivity](https://help.salesforce.com/s/articleView?id=platform.flow_build_reactive_set.htm&type=5)).
  Reactive formulas are limited to 3,900 characters
  ([Reactive Screen Flow Formula Operators](https://help.salesforce.com/s/articleView?id=platform.flow_build_reactive_screen_flow_formula_operators.htm&type=5)).
- Needs the Lightning runtime.

## Component validation

`validationRule` (`formulaExpression`, `errorMessage`) on a screen field
blocks Next and shows the message on the field. The Metadata API reference
documents it for InputField, LargeTextArea and PasswordField
([Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)), and Spring '24 extended it to every standard screen
extension component, among them Name, Address, Data Table, Lookup, Email,
Phone and File Upload
([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_extend_custom_input_validations_for_screen_extension_components.htm&release=248&type=5)).
Choice components' support is inconsistent in the docs, so check before
relying on it. Blank values are not validated, so pair with `isRequired`. Is
Blank and Is Null are not allowed in the rule
([Improve Data Quality by Validating User Input](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_screen_validate.htm&type=5)).
It works in the Lightning runtime only.

A Decision after the screen that routes back to it with an error is the
legacy pattern, and the checker flags it (FLOW013).

## Screen actions and the Action Button

A screen action runs an autolaunched flow server-side while the user stays
on the screen, and that flow must be active. Screen actions and their
triggers need org API 59+ ([Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)). The Action Button component is
GA since Winter '25
([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_action_buttons_generally_available.htm&release=252&type=5)).
Not verified: whether a flow with the button can be activated below flow API
59, because no page states an activation rule. Shape, from the example:

- `screens.actions`: `name`, `actionName` and `nameSegment` (the autolaunched
  flow's API name), `actionType` `flow`, `inputParameters`, `label`.
- A field with `fieldType` ComponentInstance, `extensionName`
  `flowruntime:actionButtonField`, input parameters `label`, and `isSuccess`,
  `inProgress`, `errorMessage` bound to `<action>.IsSuccess`,
  `<action>.InProgress`, `<action>.ErrorMessage`.
- `screens.triggers`: `eventName` `flow__screenfieldclick`, `eventSource` the
  button field, `handlers.screenActionName` the action.
- Read outputs as `{!<action>.Results.<outputVariable>}`.

Actions can also run automatically on screen load or when a condition
changes (GA Summer '25,
[release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_automatically_triggered_screen_actions.htm&release=256&type=5)),
through `initBehavior` runOnLoad or runOnRevisit (org API 64) and handler
`conditions`. Those trigger event names are not documented, so
configure one in Flow Builder, retrieve it, and copy the shape.

## Embedding surfaces

| Surface | What changes |
| --- | --- |
| Lightning record page, app page, quick action, utility bar | Full component set, reactive, screen actions |
| Experience Cloud | Lightning runtime. Check guest-user access to every queried object |
| Slack | Send a screen flow by action (GA). Supports Checkbox, Checkbox Group (≤10 choices), Currency, Date, Date/Time, Display Text, Long Text Area, Number, Picklist (≤100), Radio Buttons (≤10), Text. No field-level validation, and text input variables only. |
| Salesforce Classic runtime | No reactive screens, no validation on components, no screen actions |

List a surface outside this list as an open decision in the build spec, and
keep the reactive features (escape E5 needs a named surface).
