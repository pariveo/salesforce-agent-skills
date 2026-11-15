---
type: llm
---

On a create, the after-save flows that run are Account_After_Create_Set_Rating (create only, trigger order 20) and Account_After_Audit (create and update, no trigger order). Account_After_Revenue_Reached runs on update only. The workflow rules Account_Hot_Rating and Account_Flag_Hot and the process Account_Process_Banking run after the Apex after trigger and before the after-save flows.

PASS if the response places the workflow rules and the process after the Apex after-insert trigger and before the after-save flows, places Account_After_Create_Set_Rating before Account_After_Audit, and says Account_After_Revenue_Reached doesn't run on a create.
FAIL if it runs any after-save flow before the workflow rules or the process, orders the two after-save flows the other way, or says Account_After_Revenue_Reached runs on a create.
