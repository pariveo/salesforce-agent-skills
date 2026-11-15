---
type: llm
---

PASS if the response says Rating ends as Hot and Site as Flagged, and that Account_After_Revenue_Reached runs on this save while Account_After_Create_Set_Rating doesn't.
FAIL if it says Rating ends as Warm or Cold, Site stays blank, Account_After_Create_Set_Rating runs, or Account_After_Revenue_Reached doesn't run.
