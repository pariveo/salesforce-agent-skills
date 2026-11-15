---
type: llm
---

On this create, Rating is Warm from the before-save flow, then Hot from the workflow field update, then Cold from Account_After_Create_Set_Rating, whose update of the record runs the Apex triggers again but not the before-save flows. Type is Prospect from Account_Before_Tag_Late, then Customer - Channel from the process, whose update likewise doesn't re-run the before-save flows.

PASS if the response says Rating ends as Cold and Type as Customer - Channel, and gives the order of the writes as the reason.
FAIL if it says Rating ends as Warm or Hot, or Type as Prospect, for example because it assumes the before-save flows run again on the later updates.
