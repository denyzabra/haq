// Attaches every test in test_plan.json to the agent: writes
// platform_settings.testing.attached_tests in agent_configs/HAQ.json from the
// test IDs that `elevenlabs tests push` registered in tests.json and the
// workflow node each test runs on. Only the attached_tests array is rewritten,
// so the rest of the file stays byte for byte as the ElevenLabs CLI wrote it.
// Usage: elevenlabs tests push, then npm run tests:attach, then elevenlabs agents push.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const CONFIG = new URL("../agent_configs/HAQ.json", import.meta.url);
const registered = read("tests.json").tests;
const plan = read("test_plan.json").tests;

const attached = plan.map(({ config, workflow_node_id }) => {
  const entry = registered.find((t) => basename(t.config ?? "") === basename(config));
  const id = entry?.id ?? entry?.test_id;
  if (!id) throw new Error(`${config} has no test ID in tests.json; run elevenlabs tests push first.`);
  return { test_id: id, workflow_node_id };
});

const text = readFileSync(CONFIG, "utf8");
const start = text.indexOf('"attached_tests": [', text.indexOf('"testing": {'));
if (start === -1) throw new Error("No platform_settings.testing.attached_tests in agent_configs/HAQ.json.");
const end = text.indexOf("]", start) + 1;
const indent = text.slice(text.lastIndexOf("\n", start) + 1, start);
const array = JSON.stringify(attached, null, 4).replaceAll("\n", `\n${indent}`);
const updated = `${text.slice(0, start)}"attached_tests": ${array}${text.slice(end)}`;
if (JSON.stringify(JSON.parse(updated).platform_settings.testing.attached_tests) !== JSON.stringify(attached)) {
  throw new Error("Could not update attached_tests safely; edit agent_configs/HAQ.json by hand.");
}
writeFileSync(CONFIG, updated);
const perNode = Object.entries(Object.groupBy(attached, (t) => t.workflow_node_id)).map(([node, tests]) => `${node} ${tests.length}`);
console.log(`Attached ${attached.length} tests (${perNode.join(", ")}).`);
