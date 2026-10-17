---
type: llm
---

The flow under review updates each line item inside a loop (DML in a loop), updates the triggering Opportunity again after save, loops only to filter and total discounted lines, stores all fields in Get Records, compares OwnerId with a hard-coded ID, hard-codes an email address, and sends an email synchronously.

PASS if the response ranks the Update Records inside the loop as a top governor-limit finding (first or second), and for it proposes collecting the updates and running one Update after the collection work.
FAIL if the response misses the Update inside the loop, ranks it below cosmetic issues, or says the flow was rewritten or edited.
