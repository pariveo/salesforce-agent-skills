---
type: llm
---

Fields written by more than one automation on Account: Rating (Account_Before_Tag_A, the workflow rule Account_Hot_Rating, the after-save flow Account_After_Create_Set_Rating), Type (Account_Before_Tag_Late and the process Account_Process_Banking), and Description (the four before-save flows and AccountTrigger).

PASS if the response names Rating with all three of its writers and Type with both of its writers.
FAIL if it misses Rating or Type, or names a writer that doesn't write that field.
