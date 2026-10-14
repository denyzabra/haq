# HAQ architecture (as built)

Flow numbers 1 to 9 match the live flow panel on the demo page (`src/app/components/flows.ts`).

```mermaid
flowchart LR
  caller(["Caller<br/>browser microphone and speaker"])

  subgraph web["Vercel: demo page"]
    direction TB
    page["Demo page<br/>haq-tan.vercel.app<br/>voice UI, transcript, flow panel"]
    token["/api/conversation-token<br/>API key stays on the server<br/>3 per IP per hour, 25 per day"]
  end

  subgraph eleven["ElevenLabs agent HAQ"]
    direction TB
    asr["Scribe realtime ASR<br/>33 keyterms"]
    router["Router<br/>disclosure, consent, language"]
    rule["Rule<br/>read back, index_lookup, clause"]
    kb[("Knowledge base on Rule<br/>Decree 43, Law 26 of 2007<br/>and 33 of 2008, RDC fees, scope")]
    paper["Paperwork<br/>prepare_draft only"]
    endNode(["End"])
    tts["Eleven v3 TTS<br/>English and Arabic voices"]
    analysis["Post call analysis<br/>evaluation criteria, data collection"]
  end

  subgraph api["Vercel: server routes"]
    direction TB
    lookup["/api/tools/index-lookup<br/>Decree 43 engine in whole fils"]
    index[("data/mock-index.json<br/>DLD Rental Index, building level<br/>evidence: docs/index-evidence/")]
    draft["/api/tools/prepare-draft"]
    handover["/api/tools/request-human-handover"]
    webhook["/api/webhooks/post-call<br/>HMAC signature check"]
    verify["/api/ledger/verify"]
    staff["/staff<br/>password, signed cookie"]
  end

  subgraph redis["Upstash Redis"]
    direction TB
    drafts[("Drafts")]
    queue[("Human queue")]
    ledger[("Hash chained audit ledger")]
  end

  caller -->|"1 Speech audio"| page
  page -.->|"single use token"| token
  page -->|"2 Audio and session id"| asr
  asr --> router
  router -->|"3 Intent and fields"| rule
  kb --- rule
  rule -->|"4 Index lookup"| lookup
  lookup --- index
  rule --> tts
  tts -->|"5 Spoken answer with clause cited"| caller
  rule -->|"6 Confirmed facts only"| paper
  paper -->|"7 Draft and case reference"| draft
  rule -->|"8 Human gate, from any node"| handover
  router & rule & paper --> endNode
  endNode --> analysis
  analysis -->|"9 Post call record"| webhook
  draft --> drafts
  handover --> queue
  webhook --> ledger
  verify --- ledger
  staff --- queue & drafts & ledger
```

| Flow | What happens | Shown on the panel when |
|---|---|---|
| 1 | Caller speech to the demo page | SDK event: first caller transcript |
| 2 | Audio and session id to the agent (WebRTC) | SDK event: session connected |
| 3 | Router hands intent and fields to Rule, after consent | `index_lookup` was called (it exists only in Rule) |
| 4 | Rule calls `index_lookup`; the server matches DLD's building row and computes the cap | Server: `index_lookup` called |
| 5 | Spoken answer citing "Decree 43 of 2013, Article 1" | Detected in the agent's reply (text match, not a system event) |
| 6 | Rule hands only the confirmed facts to Paperwork | `prepare_draft` was called (it exists only in Paperwork) |
| 7 | `prepare_draft` saves the draft and returns a case reference | Server: `prepare_draft` called |
| 8 | `request_human_handover` adds the case to the human queue (any node) | Server: `request_human_handover` called |
| 9 | ElevenLabs runs the post call analysis (evaluation criteria, data collection) and sends the signed webhook; the summary and analysis are appended to the ledger | Server: signed webhook added to the ledger |

- **Trust boundaries.** The browser never holds the ElevenLabs API key: it gets a single use conversation token. The three tool routes (`index-lookup`, `prepare-draft`, `request-human-handover`) accept only requests carrying the workspace secret header `x-haq-tool-secret`. The webhook accepts only a valid `ElevenLabs-Signature`.
- **Nothing is filed.** No tool submits anything; the draft is for the caller, and filing, disputes and distress go to the human queue. In the browser demo the handover is a callback request, because `transfer_to_number` works only on phone calls.
- **Arithmetic is on the server.** The LLM never computes a cap: `index_lookup` returns the range, cap, maximum new rent and clause from DLD figures copied with evidence.
- **Audit.** Each ledger entry stores `sha256(prev_hash + canonical_json(entry))`; `/api/ledger/verify` and the Verify chain button on `/staff` recompute it.
