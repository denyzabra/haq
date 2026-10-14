// Exports ElevenLabs conversations (read only) to docs/demo-conversations/<id>.md:
// date, duration, language, the transcript turn by turn, tool calls with their
// parameters and results, and the post call analysis (evaluation criteria and
// data collection results).
// Only the fields below are written. Request headers, dynamic variables, caller
// and user IDs and costs never are, and the script refuses to write a file that
// contains the value of any secret from the environment.
// The project allows no em or en dashes in any file, so dash punctuation in the
// API text is replaced (a range like 10\u201320 becomes "10 to 20", other dashes a comma).
// That is the only change made to the text.
// Usage: scripts/with-env.sh node scripts/export-demo-conversations.mjs <conversation_id> [...]
import { mkdirSync, writeFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1/convai/conversations/";
const OUT = new URL("../docs/demo-conversations/", import.meta.url);
const SECRET_VARS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_WEBHOOK_SECRET",
  "HAQ_TOOL_SECRET",
  "STAFF_PASSWORD",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
];

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: scripts/with-env.sh node scripts/export-demo-conversations.mjs <conversation_id> [...]");
  process.exit(1);
}
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set; run the script through scripts/with-env.sh.");
  process.exit(1);
}

const clock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
const dubaiTime = (unix) =>
  new Date(unix * 1000).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "long", timeStyle: "short" });
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const json = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return String(text ?? "");
  }
};
const block = (text) => ["```json", text, "```"];

function workflowStep(resultValue) {
  try {
    const edge = JSON.parse(resultValue).steps?.find((s) => s.type === "edge");
    return edge ? `moved to the ${edge.target_node_id} node (edge ${edge.edge_id})` : "workflow step";
  } catch {
    return "workflow step";
  }
}

function render(c) {
  const m = c.metadata ?? {};
  const a = c.analysis ?? {};
  const turns = c.transcript ?? [];
  const nodes = [...new Set(turns.map((t) => t.agent_metadata?.workflow_node_id).filter(Boolean))];
  const switches = turns
    .flatMap((t) => t.tool_calls ?? [])
    .filter((call) => call.tool_name === "language_detection")
    .map((call) => JSON.parse(call.params_as_json || "{}").language)
    .filter(Boolean);

  const lines = [
    `# Demo conversation \`${c.conversation_id}\``,
    "",
    "Exported from the ElevenLabs API by `scripts/export-demo-conversations.mjs`.",
    "",
    "| | |",
    "|---|---|",
    `| Date | ${dubaiTime(m.start_time_unix_secs)} (Dubai), ${new Date(m.start_time_unix_secs * 1000).toISOString()} |`,
    `| Duration | ${clock(m.call_duration_secs ?? 0)} (${m.call_duration_secs ?? 0} s) |`,
    `| Main language | ${cell(m.main_language)}${switches.length ? `; switched to ${switches.join(", ")} during the call` : ""} |`,
    `| Agent | ${cell(c.agent_name)} (\`${c.agent_id}\`), version \`${c.version_id ?? "unknown"}\` |`,
    `| Workflow nodes visited | ${nodes.join(", ")} |`,
    `| Status | ${cell(c.status)}; ended by: ${cell(m.termination_reason)} |`,
    "",
    "## Post call analysis",
    "",
    `**${cell(a.call_summary_title)}.** Call successful: ${cell(a.call_successful)}.`,
    "",
    a.transcript_summary ?? "",
    "",
    "### Evaluation criteria",
    "",
    "| Criterion | Result | Rationale |",
    "|---|---|---|",
    ...Object.values(a.evaluation_criteria_results ?? {}).map((e) => `| \`${e.criteria_id}\` | ${cell(e.result)} | ${cell(e.rationale)} |`),
    "",
    "### Data collection",
    "",
    "| Field | Value | Rationale |",
    "|---|---|---|",
    ...Object.values(a.data_collection_results ?? {}).map((d) => `| \`${d.data_collection_id}\` | ${cell(d.value)} | ${cell(d.rationale)} |`),
    "",
    "## Transcript",
    "",
    "Times are from the start of the call. Words in square brackets at the start of an agent turn are Eleven v3 delivery tags. Em and en dashes in the original text are replaced with a comma or \"to\".",
    "",
  ];

  const results = new Map(turns.flatMap((t) => t.tool_results ?? []).map((r) => [r.request_id, r]));
  for (const t of turns) {
    const who = t.role === "user" ? "Caller" : `HAQ${t.agent_metadata?.workflow_node_id ? ` (${t.agent_metadata.workflow_node_id})` : ""}`;
    if (t.message) lines.push(`**[${clock(t.time_in_call_secs ?? 0)}] ${who}:** ${t.message.trim()}`, "");
    for (const call of t.tool_calls ?? []) {
      const result = results.get(call.request_id);
      if (call.type === "workflow") {
        lines.push(`*[${clock(t.time_in_call_secs ?? 0)}] Workflow: ${workflowStep(result?.result_value)}.*`, "");
        continue;
      }
      lines.push(`**[${clock(t.time_in_call_secs ?? 0)}] Tool call \`${call.tool_name}\`** (${call.type}). Parameters:`, "", ...block(json(call.params_as_json)), "");
      if (result) {
        lines.push(result.is_error ? `Result (error):` : "Result:", "", ...block(json(result.result_value)), "");
      }
    }
  }
  return withoutDashes(lines.join("\n")).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function withoutDashes(text) {
  return text.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2").replace(/\s*[\u2013\u2014]\s*/g, ", ");
}

function assertNoSecrets(text, id) {
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8 && text.includes(value)) {
      throw new Error(`${id}: the export contains the value of ${name}; nothing was written.`);
    }
  }
}

mkdirSync(OUT, { recursive: true });
for (const id of ids) {
  if (!/^conv_[A-Za-z0-9]+$/.test(id)) throw new Error(`Not a conversation ID: ${id}`);
  const response = await fetch(API + id, { headers: { "xi-api-key": apiKey } });
  if (!response.ok) throw new Error(`${id}: ElevenLabs API returned ${response.status}`);
  const markdown = render(await response.json());
  assertNoSecrets(markdown, id);
  writeFileSync(new URL(`${id}.md`, OUT), markdown);
  console.log(`Wrote docs/demo-conversations/${id}.md`);
}
