// Flow numbers and wording match the architecture diagram (public/haq-architecture.png).
// `evidence` says exactly what lights each flow, so the panel never claims more than it knows.
export interface FlowDefinition {
  n: number;
  title: string;
  path: string;
  evidence: string;
}

export const FLOWS: FlowDefinition[] = [
  { n: 1, title: "Speech audio", path: "Caller to web widget", evidence: "SDK event: first caller transcript" },
  { n: 2, title: "Audio and session id", path: "Web widget to Router", evidence: "SDK event: session connected" },
  { n: 3, title: "Intent and fields", path: "Router to Rule", evidence: "Confirmed by tool call (index_lookup)" },
  { n: 4, title: "Index lookup", path: "Rule to index service and back", evidence: "Server: index_lookup called" },
  { n: 5, title: "Spoken answer with clause cited", path: "Rule to caller", evidence: "Detected in agent reply" },
  { n: 6, title: "Confirmed facts only", path: "Rule to Paperwork", evidence: "Confirmed by tool call (prepare_draft)" },
  { n: 7, title: "Draft and case reference", path: "Paperwork to draft store", evidence: "Server: prepare_draft called" },
  { n: 8, title: "Human gate", path: "Handover to the human queue", evidence: "Server: request_human_handover called" },
  { n: 9, title: "Post call record", path: "Post call webhook to audit ledger", evidence: "Server: signed webhook added to ledger" },
];

// Flow 5 is text matching on the agent's reply, not a system event: an agent
// message after flow 4 that names the Decree 43 clause, in English or Arabic.
export const CLAUSE_PATTERN = /decree\s*(no\.?\s*)?\(?\s*43|article\s*\(?\s*1\b|مرسوم|المادة\s*\(?\s*(1|١)\b/i;
