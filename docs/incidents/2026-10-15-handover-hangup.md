# Incident: call ended after a handover without the callback message (15 October 2026)

**Summary.** In the Stage 2 recording, the caller asked HAQ to send the draft and file a case. HAQ correctly called `request_human_handover`, which returned a callback reference, but the workflow then moved to the End node and hung up without telling the caller that a person would call back or giving the reference. The handover itself was recorded in the human queue.

- Conversation: `conv_6001m4zstmdyespanw8a966kgs86`, export in [`docs/demo-conversations/conv_6001m4zstmdyespanw8a966kgs86.md`](../demo-conversations/conv_6001m4zstmdyespanw8a966kgs86.md)
- Started 15:50:39 Kampala time (16:50:39 Dubai), 204 seconds, English; agent version `agtvrsn_8401m4zs4jm8e6cr4sv2ynxqs83w`

## Timeline (Kampala time)

| Time | Event |
|---|---|
| 15:51:51 | `index_lookup` returns `checked` (5 percent, maximum AED 63,000, notice late); HAQ speaks the result |
| 15:53:10 | Caller: "Yes, please prepare the draft." Edge `e_rule_paperwork` fires (15:53:12) |
| 15:53:13 | `prepare_draft` returns HAQ-D-FP3C8GQV; HAQ reads the reference and summary (15:53:14) |
| 15:53:53 | Caller: "Can you send it to my landlord and file it with the Rental Disputes Center for me?" |
| 15:54:01 | `request_human_handover` returns reference HAQ-H-EJVRX8MQ and its callback message |
| 15:54:01 | **Edge `e_paperwork_end` fires** with no agent text |
| 15:54:02 | The End node calls `end_call`; the call ends without the callback message |

## Cause

The base prompt said "Then read them the callback message", but nothing stopped a transition first: right after the handover result, the Paperwork LLM called its end edge, and none of the edges into End mentioned a handover. This is the same pattern as the [silent handoff incident](2026-10-15-silent-handoff.md): an edge tool called before the agent spoke.

## Fix

- **Base prompt**, new line after the escalation rules: "After request_human_handover returns, your next turn is always to tell the caller, in their language, that a person will call them back, and read the reference it returned. Do not end the call or move to another step before that."
- **All three edges into End** (`e_paperwork_end`, `e_rule_end`, `e_router_end`), each with this sentence added to its condition: "If request_human_handover was called in this call, HAQ has already told the caller that a person will call them back and read the handover reference aloud, and only after that did the caller say they have nothing else."

## Regression test

`reply_12_callback_message_after_handover` (next reply, Paperwork): the history ends with the `request_human_handover` result from this conversation (reference HAQ-H-EJVRX8MQ). It passes only if the reply says a person will call back and gives the reference; it fails on an empty reply, `end_call`, a workflow transition or any other tool call.

## Verification

Pushed as agent version `agtvrsn_2101m4zx5h6cedgsgqxe4yxy306b`. In the repeat count 5 run of all 35 tests on 15 October 2026 (suite `suite_1301m4zx6f21f0kafehahv148yt4`), `reply_12` passed 5/5. Side effect: `guard_09_stop_no_callback_ends_call` fell to 1/5 (HAQ said goodbye without calling `end_call`), likely because the model reads the new "Do not end the call" line too broadly; a one line fix is proposed in [`docs/test-results.md`](../test-results.md).

**Later change, same day.** The base prompt sentence "Do not end the call or move to another step before that." was removed again, because `guard_09` (after "stop" and "no", HAQ must call `end_call`) fell to 0/5 while it was in place. The rest of the line and the three End edge conditions stay; `reply_12` checks that the callback message is still given. See [`docs/test-results.md`](../test-results.md).

Not part of this fix: callback consent and language are still not passed to `request_human_handover` (a known gap in the README).
