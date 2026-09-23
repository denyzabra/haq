# HAQ: build spec for Claude Code

Put this file in the root of an empty repo and ask Claude Code to read it first.
It describes what to build for the Ignyte x ElevenLabs Stage 1 proof of build: a deployed demo page and a system you can record in 60 seconds.

## 1. What HAQ is

HAQ is a voice agent that checks a Dubai rent increase against Decree 43 of 2013 and explains the result, citing the clause, in English or Arabic. It gives information, not legal advice. It never files anything. Filing, disputes and distress go to a human.

The design is already fixed by the submitted Idea Canvas (boxes I, J, K, L). Build to it. Do not add features that are not listed here.

## 2. Target architecture (matches canvas box L)

Zone 1, caller and channel
- Next.js (App Router, TypeScript) page with a custom voice UI built on `@elevenlabs/react` (`ConversationProvider`, `useConversation`). WebRTC connection.
- The agent is private. The browser gets a conversation token from our own API route; the ElevenLabs API key never reaches the client.
- Twilio telephony is pilot phase only. Do not build it.

Zone 2, ElevenLabs platform
- One ElevenLabs agent managed as code with the ElevenLabs CLI (`elevenlabs agents init`, `agents add`, `agents push/pull`; `tools` and `tests` commands).
- Agent Workflow with three subagent nodes: Router, Rule, Paperwork. Plus an End node.
  - Router: disclosure, consent, language, intent. Tools: none except system tools.
  - Rule: intake with read back, calls `index_lookup`, speaks the answer with the clause. Knowledge base attached here.
  - Paperwork: tool list is ONLY `prepare_draft`. No submit tool exists anywhere.
- If the CLI config cannot express the workflow, build it in the dashboard Workflow editor, then run `elevenlabs agents pull` so the repo matches what is live.
- Every node has access to the `request_human_handover` tool and `end_call`.
- System tool `language_detection` enabled (English and Arabic).
- TTS: try "V3 Conversational" (Eleven v3, expressive mode). Check Arabic quality by ear; if it is weak, set the Arabic voice on a model that handles Arabic well and note it in the README.
- ASR: enable Scribe v2 Realtime in the agent's Advanced settings. Add keyterms if the setting exists: Decree 43, Ejari, RERA, DLD, RDC, Rental Disputes Center, JVC, Dubai Marina, Deira, Al Barsha.
- Knowledge base with RAG: one markdown file per source (see section 5).
- Data collection fields: `area`, `unit_type`, `current_rent_aed`, `renewal_date`, `notice_received_date`, `outcome` (lawful | above_cap | cannot_verify), `callback_consent` (bool), `opted_out` (bool), `escalated` (bool), `escalation_reason`.
- Evaluation criteria: `disclosure_given`, `clause_cited`, `no_legal_advice_given`, `read_back_done`, `escalated_when_required`.
- Post call webhook (`post_call_transcription`) pointing at our `/api/webhooks/post-call`.
- Agent Testing: at least 30 tests (see section 7), attached to the agent.

Zone 3, institution systems (all inside the same Next.js app as API routes, storage in Upstash Redis via the Vercel integration)
- `POST /api/tools/index-lookup`: server (webhook) tool. Input: area, unit_type, current_rent_aed. Looks up the average from a seeded mock index (`data/mock-index.json`), computes the Decree 43 tier deterministically (section 4), returns `{index_average_aed, percent_below_average, max_increase_percent, max_new_rent_aed, clause, data_source}`. The LLM never does this arithmetic. The founder will copy real averages from the DLD Rental Index for 5 to 8 area and unit combinations; until then use placeholder values and return `data_source: "demo sample, not official"`. Never present a placeholder as an official figure.
- `POST /api/tools/prepare-draft`: returns an objection summary text and a case reference, stores it in the draft store. It does not send anything anywhere.
- `POST /api/tools/request-human-handover`: creates an entry in the human queue with the conversation summary and reason, returns a reference and a callback message. See the note in section 3.
- `POST /api/webhooks/post-call`: verifies the `ElevenLabs-Signature` HMAC with the SDK helper (`constructEvent`), then appends an entry to a hash chained audit ledger: each entry stores `sha256(prev_hash + canonical_json(entry))`. Store transcript summary, evaluation results, data collection results, tool calls, consent fields.
- `GET /api/ledger/verify`: recomputes the chain and returns ok or the first broken index.
- Tool routes require a shared secret header (`x-haq-tool-secret`) that is set on the ElevenLabs tool config. Reject anything else with 401.

Pages
- `/` the demo: explanation strip, disclaimer, start and stop button, live transcript, and a panel that lights up each numbered flow (1 to 9 from the canvas diagram) as it happens.
- `/staff` a simple human queue view (handover entries) and the last 20 ledger entries with a "verify chain" button. Protect it with a basic password from an env var.

## 3. Known platform constraint (important)

ElevenLabs documents that the `transfer_to_number` system tool only works on phone calls and is not available in the web widget. The demo runs in the browser, so in the demo the human handover is the `request_human_handover` server tool: it writes to the human queue and the agent tells the caller a person will call back. In the pilot, with Twilio, the same trigger uses `transfer_to_number`. Say this plainly in the README.

## 4. Decree 43 of 2013 rule (Article 1)

`percent_below = (index_average - current_rent) / index_average * 100`

| Current rent vs index average | Max increase |
|---|---|
| At or above average, or up to 10 percent below | 0 percent |
| More than 10, up to 20 percent below | 5 percent |
| More than 20, up to 30 percent below | 10 percent |
| More than 30, up to 40 percent below | 15 percent |
| More than 40 percent below | 20 percent |

Also check the notice rule: a change to rent must be notified at least 90 days before the contract expires (Law 26 of 2007, as amended by Law 33 of 2008). If the caller gives both dates and the notice was late, say so and cite it. Write unit tests for every boundary (10, 10.01, 20, 20.01, 30, 40, 40.01, above average, zero and negative inputs).

## 5. Knowledge base

Create `kb/` with one markdown file per source, each starting with its source URL and the date it was retrieved:
- Decree 43 of 2013 (Dubai Legislation portal).
- Law 26 of 2007 as amended by Law 33 of 2008: the articles on rent increase and the 90 day notice.
- Rental Disputes Center fee: 3.5 percent of annual rent, AED 500 minimum, AED 20,000 maximum.
- An HAQ scope file: what HAQ does, what it refuses, the exact disclosure scripts in English and Arabic.

Rules: never paraphrase the law from memory. Only include text you can trace to a source URL. Mark anything unverified as `UNVERIFIED` so the founder can check it before sign off.

## 6. Prompts

Base agent: short. Identity, scope, the "information not legal advice" line, language behaviour (answer in the caller's language), and the never list (never file, never ask for passwords, Emirates ID, UAE PASS codes or bank details).

Router first message, English: "Hello, this is HAQ, an AI information line about Dubai rent increases. I give information, not legal advice, and this call is logged. Is it okay to continue?" Provide the Arabic version in the KB scope file and use language detection to switch.

Escalation triggers, in any language: the words "human", "person", "stop"; eviction, hardship or distress; an active RDC case; a request to file; two failed read backs. Escalation goes to `request_human_handover`, never to Paperwork.

## 7. Tests (Agent Testing)

Build at least 30, managed by the CLI in `test_configs/`:
- 10 tool call tests: correct `index_lookup` parameters for varied English and Arabic intakes.
- 10 next reply tests: tier answer cites Decree 43 Article 1 and gives the right cap, for each band and boundary.
- 10 guardrail tests: disclosure first, refuses legal advice, asks for no secrets, distress triggers handover, "file it for me" triggers handover, "stop" ends the call, no submit behaviour from Paperwork.
Run each with a repeat count of 5 and save the pass rates to `docs/test-results.md`.

## 8. Environment variables

`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`, `HAQ_TOOL_SECRET`, `STAFF_PASSWORD`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or the names the Upstash integration creates). Provide `.env.example`. Never commit secrets.

## 9. Order of work

1. Scaffold Next.js, add the Decree 43 function with unit tests, the mock index and the four API routes. Tests green.
2. ElevenLabs CLI project: agent, tools, KB upload. Push.
3. Deploy to Vercel so tool and webhook URLs are public. Point tools and the post call webhook at them.
4. Demo page with conversation token route and live transcript. Then `/staff`.
5. Tests: write, push, run with repeat count 5, record results.
6. README: what runs, what is mocked (index lookup, draft store), what is not built (telephony), the handover constraint from section 3, and how to run locally.

Stop after each step, show me what changed, and wait for my go ahead.
