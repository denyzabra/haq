# Incident: silent handoff to Paperwork after index_lookup (15 October 2026)

**Summary.** During a recording of the live demo, HAQ read back the caller's details, the caller confirmed, `index_lookup` returned a correct result, and then HAQ said nothing: the workflow moved straight to Paperwork, saved a draft the caller had not asked for, and ended the call. No wrong figure was spoken and nothing was sent or filed.

- Conversation: `conv_8401m4zr14vvfy0sbjwgaqw6m0rs`, full export in [`conv_8401m4zr14vvfy0sbjwgaqw6m0rs.md`](conv_8401m4zr14vvfy0sbjwgaqw6m0rs.md)
- Started 15:19:24 Kampala time (16:19:24 Dubai, 12:19:24 UTC), 74 seconds, English
- Agent version `agtvrsn_9601m4zqas00e80txc84g18z6w0k`, LLM `gemini-3.5-flash-lite`

## Timeline

Times are from the start of the call (clock times in Kampala time are approximate to a second; the demo page showed `index_lookup` at 15:20:35 and `prepare_draft` at 15:20:37).

| Call time | Kampala | Event |
|---|---|---|
| 00:00 | 15:19:24 | Router: disclosure and consent question |
| 00:12 | 15:19:36 | Caller: "Yes, that's fine." Edge `e_router_rule` fires (00:14) |
| 00:26 | 15:19:50 | Caller gives JVC, Triple A Residence, one bedroom, AED 60,000, proposed AED 66,000, contract end 31 December 2026, notice 10 October 2026 |
| 00:47 | 15:20:11 | Rule reads every detail back |
| 01:08 | 15:20:32 | Caller: "Yes, that's correct." |
| 01:10 | 15:20:34 | `index_lookup` returns `checked`: range AED 64,038 to 78,268, 5 percent, AED 3,000, maximum new rent AED 63,000, notice late (82 days). Correct. |
| 01:11 | 15:20:35 | **Edge `e_rule_paperwork` fires.** The Rule node produced no text. |
| 01:12 | 15:20:36 | Paperwork calls `prepare_draft`: reference HAQ-D-2Y3HGP4N, `sent: false` |
| 01:13 | 15:20:37 | **Edge `e_paperwork_end` fires**; the End node calls `end_call` |
| 01:14 | 15:20:38 | Call ends ("end_call tool was called"). The caller pressed Stop after the silence, but the session had already ended. |

Every agent turn after the read back has an empty message. No tool returned an error.

## Root cause

In an ElevenLabs workflow, each outgoing LLM edge is a tool that the node's own LLM can call (`notify_condition_1_met`). Right after `index_lookup` returned, the Rule LLM called the Rule to Paperwork edge instead of speaking, treating the first half of the condition ("index_lookup returned outcome checked in this call and the caller asked for a draft objection summary") as enough; the caller never asked for a draft. The Paperwork prompt then told it to call `prepare_draft` at once, and its end edge ("The draft reference has been read to the caller and the caller has nothing else") was also called without anything being read, so the End node closed the call silently.

Contributing: both edge conditions described a state the LLM could wrongly assume, and nothing in the prompts required the spoken result or an explicit yes before a transition.

## It was already visible in testing

The repeat count 5 run on 14 October had one `reply_07_exactly_40_al_hamria` failure where the agent "made a workflow transition instead of speaking the result" (1 of 5 runs). That was this bug. It was recorded as a single, possibly random failure and not investigated.

## Fix

Agent changes (`agent_configs/HAQ.json`):

| Where | Before | After |
|---|---|---|
| Edge `e_rule_paperwork` | index_lookup returned outcome checked in this call and the caller asked for a draft objection summary. | HAQ has already spoken the index_lookup result to the caller in this call (DLD's range, the maximum increase and the maximum new rent), then offered a draft objection summary, and the caller's latest reply clearly says yes to that offer. A tool result, a confirmed read back or a proposed rent is not a yes. |
| Rule prompt, first bullet under "Speaking the result" | (new) | After index_lookup returns, your next turn is always to speak the result to the caller, as below. Do not call any other tool or move to another step before you have spoken it. |
| Rule prompt, step 4 | Offer to prepare a draft objection summary for the caller's own use. Apply the escalation rules at all times. | Then offer to prepare a draft objection summary for the caller's own use, and wait for the answer. Move to the draft step only if the caller clearly says yes. Apply the escalation rules at all times. |
| Paperwork prompt, first bullet | (new) | Call prepare_draft only if the caller clearly said yes to a draft objection summary. If they have not, ask whether they want one and wait for the answer. |
| Edge `e_paperwork_end` | The draft reference has been read to the caller and the caller has nothing else. | HAQ has read the case reference returned by prepare_draft aloud to the caller in this call, and after that the caller said they have nothing else. |

## Regression tests

Both use this conversation's history up to the `index_lookup` result, with the same parameters and the same result (checked by script against the live call):

- `reply_11_result_spoken_before_draft_aaa_late_notice` (next reply, Rule): passes only if the reply speaks DLD's range, 5 percent and AED 63,000 and cites Decree 43 of 2013, Article 1; fails on an empty reply, a workflow transition or any other tool call instead of the spoken result, or a draft before the result.
- `guard_13_no_transition_before_result_spoken` (tool call, Rule): verifies that `transfer_to_agent`, which is how a workflow transition appears in a test run, is not called after the `index_lookup` result.

## Verification

Pushed as agent version `agtvrsn_8401m4zs4jm8e6cr4sv2ynxqs83w`. In the repeat count 5 run of all 34 tests on 15 October 2026 (suite `suite_8101m4zs5gkmfnxvq12jj61x8as1`), `reply_11` passed 5/5, `guard_13` passed 5/5, and `reply_07` (which showed this bug once on 14 October) passed 5/5. Overall 163 of 170 runs passed; see [`docs/test-results.md`](../test-results.md).
