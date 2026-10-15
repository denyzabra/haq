# HAQ

HAQ is a voice agent that checks a Dubai rent increase against Decree 43 of 2013 and explains the result, citing the clause, in English or Arabic.

**AI information line, not legal advice.** HAQ gives information only. It never files anything. Filing, disputes and distress go to a person.

## Stage 2 submission

- **Live demo:** https://haq-tan.vercel.app
- **Demo video:** VIDEO_LINK_HERE
- **Architecture, one page:** [`docs/architecture.md`](docs/architecture.md) (Mermaid diagram of the system as built, flows 1 to 9 as on the demo page)
- **Agent test results:** [`docs/test-results.md`](docs/test-results.md). Headline: **163 of 170 runs passed (95.9 percent)**, all 34 ElevenLabs Agent Testing tests at repeat count 5, up from 143 of 160 (89.4 percent) in the first repeat count 5 run and a repeat count 1 baseline of 25 of 32 (78.1 percent).
- **Incident found while recording, fixed and tested:** [`docs/incidents/2026-10-15-silent-handoff.md`](docs/incidents/2026-10-15-silent-handoff.md) (HAQ moved to the draft step without speaking the result; two regression tests now cover it).
- **Demo conversations:** [`docs/demo-conversations/`](docs/demo-conversations/), one file per conversation with the full transcript, tool calls and results, and the post call analysis (evaluation criteria and data collection), exported from the ElevenLabs API by `scripts/export-demo-conversations.mjs`.

Built for the Ignyte x ElevenLabs Stage 1 proof of build. The design follows the submitted Idea Canvas; the original architecture diagram is in [`public/haq-architecture.png`](public/haq-architecture.png).

## What runs

Everything in this table runs end to end in the live demo: the browser gets a token, talks to the agent (Router, Rule, Paperwork), the agent calls our tool routes on Vercel, and after the call ElevenLabs sends a signed webhook that is added to the ledger.

| Zone | Part | Where |
|---|---|---|
| 1. Caller and channel | Demo page with a custom voice UI (`@elevenlabs/react`, WebRTC), English and Arabic start, live transcript, live flow panel | `src/app/page.tsx`, `src/app/components/` |
| 1. Caller and channel | Conversation token route: the agent is private, so the browser gets a single use token from our server and never sees the API key | `src/app/api/conversation-token/route.ts` |
| 2. ElevenLabs platform | One agent, managed as code with the ElevenLabs CLI: workflow with Router, Rule and Paperwork sub agents plus an End node | `agent_configs/HAQ.json`, `agents.json` |
| 2. ElevenLabs platform | Three server (webhook) tools, each authenticated with a workspace secret header | `tool_configs/`, `tools.json` |
| 2. ElevenLabs platform | Knowledge base with RAG, one markdown file per source | `kb/` |
| 3. Institution systems | `POST /api/tools/index-lookup`: DLD Rental Index lookup by area, building and bedrooms, then a deterministic Decree 43 calculation | `data/mock-index.json`, `src/lib/mock-index.ts`, `src/lib/decree43.ts`, `src/lib/rent-check.ts` |
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
- **Speech recognition:** Scribe realtime with keyterms (Decree 43, Ejari, RERA, DLD, RDC, JVC, Dubai Marina, Deira, Al Barsha), plus every DLD area and building name in the index and their aliases, kept in sync by `npm run sync:keyterms`. Scribe realtime takes at most 50 keyterms of at most 20 characters each, so longer names (Rental Disputes Center, Al Barsha South Fourth, Jumeirah Village Circle and the two long Souq Al Ayaas names) are left out; the shorter forms in the list cover them.
- **Data collection:** `area`, `building`, `unit_type`, `current_rent_aed`, `renewal_date`, `notice_received_date`, `outcome`, `callback_consent`, `opted_out`, `escalated`, `escalation_reason`.
- **Evaluation criteria:** `disclosure_given`, `clause_cited`, `no_legal_advice_given`, `read_back_done`, `escalated_when_required`.
- **Limits:** authentication required (no public agent ID access), 300 second maximum conversation, 25 conversations per day (`call_limits.daily_limit`), and the client may override only the language.

### The LLM never does the arithmetic

`index_lookup` computes the Decree 43 cap on the server in whole fils (AED x 100), so every step is exact. HAQ follows the DLD Rental Index calculator:

1. Percent below the index average = (average - rent) / average x 100, rounded to the nearest whole number. An exact .5 is rounded down.
2. That whole number gives the cap:

| Percent below the index average (whole number) | Max increase |
|---|---|
| At or above average, or 0 to 10 | 0 percent |
| 11 to 20 | 5 percent |
| 21 to 30 | 10 percent |
| 31 to 40 | 15 percent |
| 41 and above | 20 percent |

So 10.5 percent below is no increase, 10.6 is 5 percent, 40.5 is 15 percent and 40.9 is 20 percent. The increase is not rounded, as on DLD's calculator (for example AED 3,577.5 on a rent of AED 71,550). The rounding rule is **inferred from the 19 DLD calculator results** collected on 14 October 2026 (3 result PDFs, 11 English page lookups and 5 Arabic page lookups; [`docs/index-evidence/al-hamriya-al-hamria-3br-boundary-lookups.json`](docs/index-evidence/al-hamriya-al-hamria-3br-boundary-lookups.json) and the Arabic page lookups in [`docs/index-evidence/dld-arabic-names-and-band-text.json`](docs/index-evidence/dld-arabic-names-and-band-text.json)); DLD has not published it. The tool also returns DLD's own wording of the band in English and Arabic (`dld_band_text_en`, `dld_band_text_ar`), copied from those responses.

The index average comes from DLD's range for the building: see [Index data](#index-data-dld-rental-index).

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

## Index data (DLD Rental Index)

The DLD Rental Index is building level: a search needs the area, the building name and the bedrooms, and DLD returns a range ("Rental Index for Same Property Type, From X to Y") plus its own permitted increase.

- `data/mock-index.json` (the file keeps its original name) holds DLD figures copied by hand from https://dubailand.gov.ae/en/eservices/rental-index/, one entry per area, building and bedrooms. Each entry stores exactly what DLD showed: the range, the retrieval date, the contract end date used for the search, the source URL, an evidence file in `docs/index-evidence/`, and DLD check rows (rent entered, DLD percent, DLD increase, DLD new rent). Nothing is added, rounded or estimated. Every response says `data_source: "DLD Rental Index, building level, retrieved 14 October 2026"`.
- **Evidence files** in `docs/index-evidence/`: the three DLD result PDFs (`aaa-1br-60000.pdf`, `al-eyas-souq-al-ayaas-1br-52000.pdf`, `al-hamriya-al-hamria-3br-70000.pdf`), the raw boundary lookups for AL HAMRIA (`al-hamriya-al-hamria-3br-boundary-lookups.json`, 11 English page lookups) and DLD's Arabic names, band wording and Arabic page lookups (`dld-arabic-names-and-band-text.json`, 5 lookups).
- **Coverage.** Three DLD rows: AAA RESIDENCE (Al Barsha South Fourth, 1 bedroom), DUBAI MUNCIPALITY-SOUQ AL AYAAS (Al Eyas, 1 bedroom) and AL HAMRIA (Al Hamriya, 3 bedrooms, hotel apartment). Any other building returns `cannot_verify`.
- **UNVERIFIED assumption: the index average.** Decree 43 compares the rent with the index average, but DLD shows a range. We assume the range is the average plus or minus 10 percent, so the average is the midpoint of the range, rounded to the nearest dirham (`src/lib/index-average.ts`). DLD has not published this, but it is consistent with all 19 DLD results collected so far (3 result PDFs, 11 English page lookups and 5 Arabic page lookups) and with every stored range.
- **DLD cross-check.** For every DLD check row, a unit test runs our Decree 43 engine on the derived average and requires DLD's own percent, increase and new rent exactly. If DLD and the engine disagree the test fails; the engine is never adjusted to fit. Another test proves every stored check row, band text and Arabic name still matches the evidence files.
- **Matching.** Area, building and bedrooms must match the DLD name or an alias in `src/lib/index-aliases.ts` exactly, ignoring case, spaces, punctuation and symbols, with Arabic letter forms folded (see [Arabic](#arabic)). There is no fuzzy or nearest match. An unknown area, a building that is not in the index for that area, or bedrooms DLD did not list for that building returns `cannot_verify` with the reason (`unknown_area`, `unknown_building`, `unknown_bedrooms`). Arabic aliases are marked UNVERIFIED.

To add a DLD row, add an entry to `data/mock-index.json` with its evidence file and at least one DLD check row, store DLD's text results as shown ("No Increase", "Not Applicable"), and give it DLD's official Arabic names. Evidence saved as raw calculator responses or Arabic names (JSON in `docs/index-evidence/`) is copied in by script, never typed: `npm run import:dld -- docs/index-evidence/<file>.json`. Then run `npm run sync:keyterms` and `npm test` (both scripts need Node 23.6 or newer). The schema rejects a malformed or duplicate row, the cross-check runs automatically, and a test fails if a name is missing from the ASR keyterms. Only add an alias in `src/lib/index-aliases.ts` if callers use a different name from DLD's.

## Arabic

- **Official DLD strings (sourced).** Each index entry stores DLD's official Arabic area, building, bedrooms and property type names (`area_ar`, `building_ar`, `bedrooms_ar`, `property_type_ar`), and the index stores DLD's Arabic band wording. All of them are copied by script from [`docs/index-evidence/dld-arabic-names-and-band-text.json`](docs/index-evidence/dld-arabic-names-and-band-text.json) (DLD's Arabic calculator page, matched to English by DLD's own option IDs). DLD's Arabic page has no Arabic name for DUBAI MUNCIPALITY-SOUQ AL AYAAS, so its `building_ar` is null. The Rule prompt's Arabic terms ("مؤشر الإيجارات", "دائرة الأراضي والأملاك", the decree name "مرسوم تحديد الزيادة في بدل الإيجار رقم 43/2013" and "المادة (1)") were copied by script from DLD's Arabic page, the evidence file and DLD's Arabic decree copy; the article number was checked visually because that PDF's text layer garbles digits.
- **Matching.** Official Arabic names always match. Alef forms (أ إ آ ٱ) are read as ا, ة as ه and ى as ي; tatweel and diacritics are ignored; Arabic-Indic and Persian digits are read as 0 to 9, and an Arabic thousands separator or comma between digits is ignored in amounts. Matching is still exact after that.
- **UNVERIFIED, native speaker review pending:** the colloquial Arabic aliases in `src/lib/index-aliases.ts`; the Arabic escalation and stop words in the agent prompt ("موظف", "شخص", "إنسان", "توقف"); every Arabic sentence HAQ writes itself (the Arabic draft summary in `src/lib/draft-summary.ts`, the Arabic sentence in `kb/haq-scope.md`, and the Arabic caller and agent turns in the agent tests); the Arabic disclosure script and first message; and the notice rule in Arabic, which HAQ explains in its own words because `kb/` holds no Arabic source for Law 26 of 2007 Article 14.
- Only the official DLD strings above are sourced. Nothing else in Arabic has been reviewed by a native speaker yet.

## What is mocked

- **DLD Rental Index.** There is no DLD API. `index_lookup` reads the DLD figures in `data/mock-index.json`, copied from DLD's public calculator on 14 October 2026 (see [Index data](#index-data-dld-rental-index)). The figures are real; the lookup is a static snapshot of three rows.
- **Draft store.** Drafts are saved in Redis for the caller only. Nothing is sent, submitted or filed anywhere.
- **Human queue.** Handover requests are saved in Redis and shown on `/staff`. Nobody is notified automatically.

## What is not built

- **Telephony (Twilio).** Pilot phase only. The demo runs in the browser, so there is no phone number and no live transfer (see the handover constraint below).

## Human handover in the demo (platform constraint)

ElevenLabs documents that the `transfer_to_number` system tool only works on phone calls and is not available in the web widget. The demo runs in the browser, so here the human handover is the `request_human_handover` server tool: it writes the conversation summary and reason to the human queue and the agent tells the caller a person will call back. In the pilot, with Twilio, the same trigger will use `transfer_to_number` for a live transfer.

Escalation triggers, in any language: "human" or "person", or a request for a person; eviction, hardship or distress; an active Rental Disputes Center case; a request to file; two failed read backs. Escalation always goes to `request_human_handover`, never to Paperwork.

"Stop" is handled separately and is not an escalation trigger: HAQ first asks once whether the caller wants a callback and calls no tool until the caller answers. If yes, it uses `request_human_handover`; if no, it says goodbye and uses `end_call`.

## Agent tests

34 ElevenLabs Agent Testing configs in `test_configs/`, generated by `npm run tests:generate` (`scripts/generate-agent-tests.mjs`) with their category and workflow node in `test_plan.json`:

| Category | Tests | Node | What they check |
|---|---|---|---|
| Tool call | 10 | Rule | `index_lookup` is called after the read back with the confirmed area, building, bedrooms and rent, in English, Arabic, Arabic-Indic digits, colloquial names and mixed language; no call before confirmation; an unknown building is passed as the caller said it |
| Next reply | 11 | Rule | The spoken result after `index_lookup`, spoken before anything else: DLD's range, the cap and maximum new rent, the clause, the DLD calculator, no index average or own percent below the average; every band edge (10, 10.5, 10.6, 20, 30, 40, 40.5, 40.9); the late notice wording; Arabic replies with DLD's Arabic names and band text |
| Guardrail | 13 | Router, Rule, Paperwork | Consent before intake, no workflow transition right after `index_lookup`, declined consent ends the call, no legal advice, no Emirates ID, handover for distress, filing requests and "موظف", "stop" asks about a callback, Paperwork never submits; English and Arabic |

Each next reply test injects an `index_lookup` result that a unit test proves is exactly what our server returns, and each tool call test's expected parameters accept every name the server resolves.

```bash
npm run tests:generate                    # rewrite test_configs/ and test_plan.json
scripts/with-env.sh elevenlabs tests push # create or update the tests in ElevenLabs
npm run tests:attach                      # attach them to the agent with their workflow node
scripts/with-env.sh elevenlabs agents push --agent agent_9101m36p8c60evcatp1tqsyswhjt
```

What we observed when running them (14 October 2026):

- Tests run against the published agent version. Webhook tools are not called in test mode ("Skipping tool call in test mode"), so tests do not write to the ledger, the human queue or the drafts, and no request reaches Vercel.
- Test runs are not listed as conversations and do not count against the agent's conversations per day limit.
- Each test run costs about 27 to 40 credits (4,922 for the 160 runs at repeat count 5).
- In a tool call test, a webhook tool's parameters are addressed as `body.<name>`: a plain `area` was "not found" although the agent passed it, and `body.area` passed. ElevenLabs does not document the path syntax.

## Test results

Current result, 15 October 2026: **163 of 170 runs passed (95.9 percent)**, 34 tests at repeat count 5, agent version `agtvrsn_8401m4zs4jm8e6cr4sv2ynxqs83w`. Every result, the failure analysis and every change between runs are in [`docs/test-results.md`](docs/test-results.md); earlier runs are kept there as history.

| Category | Tests | Current, repeat 5 (15 October) | Repeat 5 (14 October) | Repeat 1 baseline (14 October) |
|---|---|---|---|---|
| Tool call | 10 | 49/50 (98.0%) | 47/50 (94.0%) | 8/10 (80%) |
| Next reply | 11 | 54/55 (98.2%) | 46/50 (92.0%) | 8/10 (80%) |
| Guardrail | 13 | 60/65 (92.3%) | 50/60 (83.3%) | 9/12 (75%) |
| **All** | **34** | **163/170 (95.9%)** | **143/160 (89.4%)** | **25/32 (78.1%)** |

The earlier runs had 32 tests. Between runs: after the baseline, five prompt changes, one edge condition and one test (pass the caller's own words to `index_lookup`, move past consent only after an explicit yes, ask about a callback before any tool after "stop", never say how far below the average the rent is, name DLD's Arabic names first, treat a request to send the draft as a handover). After the first repeat 5 run, the fix for the [silent handoff incident](docs/incidents/2026-10-15-silent-handoff.md) (speak the `index_lookup` result before anything else; move to the draft step only after an explicit yes) and two regression tests for it, which passed 5/5.

Still open: when the caller asks a question before answering the consent question, the Router moves on without asking again (`guard_01`, 0/5; a fix is proposed in `docs/test-results.md`). Single failures in 5 runs: one Arabic bedrooms value with a digit instead of the caller's words (`tool_05`; the server answers `cannot_verify`, never a wrong figure) and one Arabic range read in words (`reply_06`).

## Knowledge base and open items

Each file in `kb/` starts with its source URL and retrieval date, and quotes the official text without paraphrase:

- `decree-43-2013.md`: Dubai Legislation Portal. The Arabic text prevails over the English version.
- `law-26-2007-and-law-33-2008.md`: Articles 9, 13 and 14 as superseded by Law 33 of 2008, and Article 10 of Law 26 of 2007.
- `rdc-fees.md`: Rental Disputes Center fee (3.5 percent of annual rent, AED 500 minimum, AED 20,000 maximum) from the official RDC website.
- `haq-scope.md`: what HAQ does and refuses, and the disclosure scripts.

To check before sign off (marked `UNVERIFIED` in the files):

- The legislation behind the RDC fees has not been located; the figures come from the RDC website only.
- The Arabic disclosure script needs review by a native Arabic speaker.
- The index average is assumed to be the midpoint of DLD's range (see [Index data](#index-data-dld-rental-index)). Confirm against DLD's method.
- The band rounding rule is inferred from 19 DLD calculator results, not a published method.
- Arabic items listed under [Arabic](#arabic), and an Arabic source for the notice rule.
- Arabic voice quality on Eleven v3 has not yet been checked by ear. If it is weak, the Arabic preset will move to a model that handles Arabic better and this README will say which.

## Security and privacy

- The ElevenLabs API key stays on the server; the browser only receives a single use conversation token.
- The token route allows 3 sessions per IP per hour and 25 per day in total across all callers (configurable; there is no per IP daily cap), rejects requests from other sites, and stores IPs only as hashes.
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
  -d '{"area":"JVC","building":"AAA Residence","bedrooms":"1 bedroom","current_rent_aed":60000}'
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
| `HAQ_IP_HOURLY_CAP`, `HAQ_DAILY_SESSION_CAP` | Optional session limits, default 3 per IP per hour and 25 per day in total |

Never commit `.env` or `.env.local`.

### Managing the agent with the ElevenLabs CLI

`scripts/with-env.sh` runs a command with `.env` loaded, without printing anything.

```bash
scripts/with-env.sh elevenlabs tools push
scripts/with-env.sh elevenlabs agents push --dry-run
scripts/with-env.sh elevenlabs agents push
scripts/with-env.sh elevenlabs agents pull --agent agent_9101m36p8c60evcatp1tqsyswhjt --update
```

For the agent tests, see [Agent tests](#agent-tests). To export conversations with their transcript and post call analysis: `scripts/with-env.sh node scripts/export-demo-conversations.mjs <conversation_id> [...]`. Always pull with `--agent`: a bare `agents pull` imports every agent in the workspace. When a `kb/` file changes, upload it again, then update the document ID in `kb/manifest.json` and in the Rule node of `agent_configs/HAQ.json`.

## Project layout

```
agent_configs/   ElevenLabs agent config (pushed and pulled with the CLI)
tool_configs/    ElevenLabs webhook tool configs
data/            DLD Rental Index figures, building level (mock-index.json)
docs/            architecture, index evidence from the DLD website, agent test results, demo conversations
kb/              knowledge base sources and document IDs
public/          architecture diagram
scripts/         CLI helper, DLD evidence import, ASR keyterm sync, agent test generation and attach, conversation export
test_configs/    ElevenLabs Agent Testing configs (generated); test_plan.json maps each to its node
src/app/         demo page, /staff and API routes
src/lib/         Decree 43 logic, index lookup, ledger, store, rate limits, flows, staff auth
```
