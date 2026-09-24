# HAQ

HAQ is a voice agent that checks a Dubai rent increase against Decree 43 of 2013 and explains the result, citing the clause, in English or Arabic.

**AI information line, not legal advice.** HAQ gives information only. It never files anything. Filing, disputes and distress go to a person.

Live demo: https://haq-tan.vercel.app

Built for the Ignyte x ElevenLabs Stage 1 proof of build. The design follows the submitted Idea Canvas; the architecture diagram is in [`public/haq-architecture.png`](public/haq-architecture.png).

## What runs

| Zone | Part | Where |
|---|---|---|
| 1. Caller and channel | Demo page with a custom voice UI (`@elevenlabs/react`, WebRTC), English and Arabic start, live transcript, live flow panel | `src/app/page.tsx`, `src/app/components/` |
| 1. Caller and channel | Conversation token route: the agent is private, so the browser gets a single use token from our server and never sees the API key | `src/app/api/conversation-token/route.ts` |
| 2. ElevenLabs platform | One agent, managed as code with the ElevenLabs CLI: workflow with Router, Rule and Paperwork sub agents plus an End node | `agent_configs/HAQ.json`, `agents.json` |
| 2. ElevenLabs platform | Three server (webhook) tools, each authenticated with a workspace secret header | `tool_configs/`, `tools.json` |
| 2. ElevenLabs platform | Knowledge base with RAG, one markdown file per source | `kb/` |
| 3. Institution systems | `POST /api/tools/index-lookup`: deterministic Decree 43 calculation | `src/lib/decree43.ts`, `src/lib/rent-check.ts` |
| 3. Institution systems | `POST /api/tools/prepare-draft`: saves a draft objection summary with a case reference | `src/app/api/tools/prepare-draft/route.ts` |
| 3. Institution systems | `POST /api/tools/request-human-handover`: adds an entry to the human queue | `src/app/api/tools/request-human-handover/route.ts` |
| 3. Institution systems | `POST /api/webhooks/post-call`: verifies the ElevenLabs HMAC signature, then appends to a hash chained audit ledger | `src/app/api/webhooks/post-call/route.ts`, `src/lib/ledger.ts` |
| 3. Institution systems | `GET /api/ledger/verify`: recomputes the chain and returns ok or the first broken index | `src/app/api/ledger/verify/route.ts` |
| 3. Institution systems | `/staff`: human queue, drafts, last 20 ledger entries and a Verify chain button, behind a password | `src/app/staff/` |

Storage is Upstash Redis through the Vercel integration.

### Agent

- **Workflow.** Router (disclosure, consent, language, intent; no tools of its own), Rule (read back, `index_lookup`, knowledge base, spoken answer with the clause), Paperwork (only tool is `prepare_draft`). No submit tool exists anywhere.
- **Every node** has `request_human_handover` and `end_call`. `language_detection` is on for English and Arabic.
- **LLM:** `gemini-3.5-flash-lite`, with `gemini-3.8-flash` as backup.
- **Voice:** Eleven v3 conversational (`eleven_v3_conversational`) with expressive mode. English voice `ZIlrSGI4jZqobxRKprJz`; Arabic preset with voice `oUCSlKjkoFDoKamPHpAV` and an Arabic first message.
- **Speech recognition:** Scribe realtime with keyterms (Decree 43, Ejari, RERA, DLD, RDC, Rental Disputes Center, JVC, Dubai Marina, Deira, Al Barsha).
- **Data collection:** `area`, `unit_type`, `current_rent_aed`, `renewal_date`, `notice_received_date`, `outcome`, `callback_consent`, `opted_out`, `escalated`, `escalation_reason`.
- **Evaluation criteria:** `disclosure_given`, `clause_cited`, `no_legal_advice_given`, `read_back_done`, `escalated_when_required`.
- **Limits:** authentication required (no public agent ID access), 300 second maximum conversation, 5 conversations per day, and the client may override only the language.

### The LLM never does the arithmetic

`index_lookup` computes the Decree 43 tier on the server in whole fils (AED x 100) so band edges are exact:

| Current rent vs index average | Max increase |
|---|---|
| At or above average, or up to 10 percent below | 0 percent |
| 11 to 20 percent below | 5 percent |
| 21 to 30 percent below | 10 percent |
| 31 to 40 percent below | 15 percent |
| More than 40 percent below | 20 percent |

The official English text uses whole number bands, so a figure strictly between two bands (above 10 and below 11, above 20 and below 21, above 30 and below 31, above 40 and below 41) is not assigned to either. HAQ does not pick one: the tool returns `band_boundary: true` with both candidate caps and maximum rents, and the agent says the figure sits between two bands, states both caps, notes that the Arabic text prevails, and suggests the official DLD Rental Index calculator or a callback.

The tool also checks the 90 day notice rule (Law 26 of 2007 as amended by Law 33 of 2008, Article 14) when both dates are given. Dates are calendar dates in UTC, so a day count is never off by one. The article applies "unless otherwise agreed by the parties", and HAQ says so.

### Live flow panel

The demo page numbers flows 1 to 9 exactly as the diagram does, and lights a flow only when it really happens:

| Flow | Lit by |
|---|---|
| 1, 2 | SDK events (first caller transcript, session connected) |
| 3, 6 | Confirmed by tool call: `index_lookup` exists only in the Rule node and `prepare_draft` only in Paperwork |
| 4, 7, 8 | The tool routes, recorded in Redis per conversation |
| 5 | Detected in agent reply: text matching on an agent message that cites the clause after flow 4. This is not a system event. |
| 9 | A signed post-call webhook added to the ledger; the page waits up to 2 minutes for it after the call |

## What is mocked

- **Index lookup.** `data/mock-index.json` holds placeholder averages for 8 area and unit combinations (JVC, Dubai Marina, Deira, Al Barsha; studio and 1 bedroom). They are invented round numbers, not DLD Rental Index figures, and every response says `data_source: "demo sample, not official"`. Unknown areas return `cannot_verify` instead of a guess. Area and unit names are matched in English and Arabic.
- **Draft store.** Drafts are saved in Redis for the caller only. Nothing is sent, submitted or filed anywhere.
- **Human queue.** Handover requests are saved in Redis and shown on `/staff`. Nobody is notified automatically.

## What is not built

- **Telephony (Twilio).** Pilot phase only. The demo runs in the browser.
- **Agent Testing results.** The 30 test suite with a repeat count of 5 (spec step 5) has not been run yet; `docs/test-results.md` will hold the pass rates.

## Human handover in the demo (platform constraint)

ElevenLabs documents that the `transfer_to_number` system tool only works on phone calls and is not available in the web widget. The demo runs in the browser, so here the human handover is the `request_human_handover` server tool: it writes the conversation summary and reason to the human queue and the agent tells the caller a person will call back. In the pilot, with Twilio, the same trigger will use `transfer_to_number` for a live transfer.

Escalation triggers, in any language: "human", "person" or "stop"; eviction, hardship or distress; an active Rental Disputes Center case; a request to file; two failed read backs. Escalation always goes to `request_human_handover`, never to Paperwork.

## Knowledge base and open items

Each file in `kb/` starts with its source URL and retrieval date, and quotes the official text without paraphrase:

- `decree-43-2013.md`: Dubai Legislation Portal. The Arabic text prevails over the English version.
- `law-26-2007-and-law-33-2008.md`: Articles 9, 13 and 14 as superseded by Law 33 of 2008, and Article 10 of Law 26 of 2007.
- `rdc-fees.md`: Rental Disputes Center fee (3.5 percent of annual rent, AED 500 minimum, AED 20,000 maximum) from the official RDC website.
- `haq-scope.md`: what HAQ does and refuses, and the disclosure scripts.

To check before sign off (marked `UNVERIFIED` in the files):

- The legislation behind the RDC fees has not been located; the figures come from the RDC website only.
- The Arabic disclosure script needs review by a native Arabic speaker.
- The index averages must be replaced with real DLD Rental Index figures before any figure is presented as official.
- Arabic voice quality on Eleven v3 has not yet been checked by ear. If it is weak, the Arabic preset will move to a model that handles Arabic better and this README will say which.

## Security and privacy

- The ElevenLabs API key stays on the server; the browser only receives a single use conversation token.
- The token route allows 3 sessions per IP per hour and 5 per day in total (configurable), rejects requests from other sites, and stores IPs only as hashes.
- Tool routes require the `x-haq-tool-secret` header, compared in constant time; anything else gets 401. ElevenLabs sends it from a workspace secret, so it is not in any config file.
- The post-call webhook rejects anything without a valid `ElevenLabs-Signature`.
- The ledger stores the transcript summary, evaluation results, data collection results, tool calls and consent fields, not the full transcript. Each entry stores `sha256(prev_hash + canonical_json(entry))`, and appends are atomic so concurrent webhooks cannot fork the chain.
- `/staff` uses a password from `STAFF_PASSWORD`, a signed `HttpOnly` cookie that expires after 8 hours, and allows 5 sign in attempts per 15 minutes. It is rendered on the server only.
- Production refuses to start the store without Upstash, so the ledger is never kept in memory on serverless.
- HAQ never asks for passwords, Emirates ID numbers, UAE PASS codes or bank details.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
npm test                     # unit and route tests
npm run lint
npm run build
```

Without the Upstash variables, local development uses an in-memory store (lost on restart). The voice demo needs `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`. Every started session counts against the ElevenLabs plan's call minutes.

Try a tool route without the agent:

```bash
curl -X POST http://localhost:3000/api/tools/index-lookup \
  -H 'content-type: application/json' \
  -H "x-haq-tool-secret: $HAQ_TOOL_SECRET" \
  -d '{"area":"Deira","unit_type":"studio","current_rent_aed":30000}'
```

### Environment variables

| Name | Used for |
|---|---|
| `ELEVENLABS_API_KEY` | Server only: conversation tokens and the CLI |
| `ELEVENLABS_AGENT_ID` | The HAQ agent (`agent_9101m36p8c60evcatp1tqsyswhjt`) |
| `ELEVENLABS_WEBHOOK_SECRET` | HMAC secret of the post-call webhook |
| `HAQ_TOOL_SECRET` | Shared secret in the `x-haq-tool-secret` header; must match the ElevenLabs workspace secret `haq_tool_secret` |
| `STAFF_PASSWORD` | `/staff` sign in |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) |
| `HAQ_IP_HOURLY_CAP`, `HAQ_DAILY_SESSION_CAP` | Optional session limits, default 3 and 5 |

Never commit `.env` or `.env.local`.

### Managing the agent with the ElevenLabs CLI

`scripts/with-env.sh` runs a command with `.env` loaded, without printing anything.

```bash
scripts/with-env.sh elevenlabs tools push
scripts/with-env.sh elevenlabs agents push --dry-run
scripts/with-env.sh elevenlabs agents push
scripts/with-env.sh elevenlabs agents pull --agent agent_9101m36p8c60evcatp1tqsyswhjt --update
```

Always pull with `--agent`: a bare `agents pull` imports every agent in the workspace. When a `kb/` file changes, upload it again, then update the document ID in `kb/manifest.json` and in the Rule node of `agent_configs/HAQ.json`.

## Project layout

```
agent_configs/   ElevenLabs agent config (pushed and pulled with the CLI)
tool_configs/    ElevenLabs webhook tool configs
data/            mock rent index (demo sample, not official)
kb/              knowledge base sources and document IDs
public/          architecture diagram
scripts/         CLI helper
src/app/         demo page, /staff and API routes
src/lib/         Decree 43 logic, index lookup, ledger, store, rate limits, flows, staff auth
```
