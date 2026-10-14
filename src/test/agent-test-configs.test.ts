import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_ALIASES, BEDROOM_ALIASES, BUILDING_ALIASES } from "@/lib/index-aliases";
import { INDEX_ENTRIES, type IndexEntry } from "@/lib/mock-index";
import { intakeSchema, runRentCheck } from "@/lib/rent-check";

// Checks the ElevenLabs Agent Testing configs written by scripts/generate-agent-tests.mjs.
const root = new URL("../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

interface Turn {
  role: string;
  message?: string;
  time_in_call_secs: number;
  tool_calls?: Array<{ tool_name: string; params_as_json: string }>;
  tool_results?: Array<{ tool_name: string; result_value: string }>;
}
interface Param {
  path: string;
  eval: { type: string; pattern?: string; description?: string };
}
interface TestConfig {
  name: string;
  type: "tool" | "llm";
  chat_history: Turn[];
  success_condition?: string;
  tool_call_parameters?: { referenced_tool: { id: string; type: string }; parameters: Param[]; verify_absence: boolean };
}
interface PlanItem {
  config: string;
  category: "tool_call" | "next_reply" | "guardrail";
  workflow_node_id: string;
  index_lookup_expect?: "found" | "unknown_building";
}

const plan: PlanItem[] = read("test_plan.json").tests;
const files = readdirSync(new URL("test_configs/", root)).filter((f) => f.endsWith(".json"));
const configs = new Map<string, TestConfig>(files.map((f) => [`test_configs/${f}`, read(`test_configs/${f}`)]));
const agent = read("agent_configs/HAQ.json");
const toolIds = new Set<string>(read("tools.json").tools.map((t: { id: string }) => t.id));
const systemTools = new Set(Object.keys(agent.conversation_config.agent.prompt.built_in_tools));
const INDEX_LOOKUP_ID = read("tools.json").tools.find((t: { config: string }) => t.config.endsWith("index_lookup.json")).id;

const isArabic = (s = "") => /[\u0600-\u06FF]/.test(s);
// The patterns use a leading (?i), which the ElevenLabs evaluator reads as case
// insensitive; JavaScript takes it as a flag instead.
const compile = (pattern: string) =>
  pattern.startsWith("(?i)") ? new RegExp(pattern.slice(4), "iu") : new RegExp(pattern, "u");
// Webhook tool parameters are addressed as body.<name> (see scripts/generate-agent-tests.mjs).
const paramPattern = (test: TestConfig, path: string) =>
  compile(test.tool_call_parameters!.parameters.find((p) => p.path === `body.${path}`)!.eval.pattern!);
const namesOf = (e: IndexEntry) => ({
  area: [e.area, e.area_ar, ...(AREA_ALIASES[e.area] ?? [])],
  building: [e.building, ...(e.building_ar ? [e.building_ar] : []), ...(BUILDING_ALIASES[e.building] ?? [])],
  bedrooms: [e.bedrooms, e.bedrooms_ar, ...(BEDROOM_ALIASES[e.bedrooms] ?? [])],
});
const userTurns = (t: TestConfig) => t.chat_history.filter((turn) => turn.role === "user");
const items = plan.map((item) => ({ ...item, test: configs.get(item.config)! }));

describe("agent test configs", () => {
  it("has one plan entry per config file and at least ten tests per category", () => {
    expect(plan.map((p) => p.config).sort()).toEqual([...configs.keys()].sort());
    for (const category of ["tool_call", "next_reply", "guardrail"]) {
      expect(plan.filter((p) => p.category === category).length, category).toBeGreaterThanOrEqual(10);
    }
  });

  it("covers Arabic: 4 tool call intakes, 3 next replies and 3 guardrails", () => {
    const arabic = (category: string) => items.filter((i) => i.category === category && userTurns(i.test).some((u) => isArabic(u.message)));
    expect(arabic("tool_call").length).toBeGreaterThanOrEqual(4);
    expect(arabic("next_reply").length).toBeGreaterThanOrEqual(3);
    expect(arabic("guardrail").length).toBeGreaterThanOrEqual(3);
  });

  it.each(items.map((i) => ({ name: i.test.name, ...i })))("$name is well formed", ({ config, test, workflow_node_id }) => {
    expect(config).toBe(`test_configs/${test.name}.json`);
    expect(Object.keys(agent.workflow.nodes)).toContain(workflow_node_id);
    expect(JSON.stringify(test)).not.toMatch(/[\u2013\u2014]/);
    const times = test.chat_history.map((t) => t.time_in_call_secs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const turn of test.chat_history) expect(["user", "agent"]).toContain(turn.role);
    if (test.type === "tool") {
      const tool = test.tool_call_parameters!.referenced_tool;
      expect(tool.type === "system" ? systemTools.has(tool.id) : toolIds.has(tool.id), tool.id).toBe(true);
      for (const p of test.tool_call_parameters!.parameters) {
        if (p.eval.type === "regex") expect(() => compile(p.eval.pattern!)).not.toThrow();
        if (tool.type === "webhook") expect(p.path).toMatch(/^body\./);
      }
    } else {
      expect(test.success_condition).toBeTruthy();
    }
  });

  const lookups = items.filter((i) => i.index_lookup_expect);
  it.each(lookups.map((i) => ({ name: i.test.name, ...i })))(
    "$name: expected parameters accept every name the server resolves for the building",
    ({ test, index_lookup_expect }) => {
      const [area, building, bedrooms] = ["area", "building", "bedrooms"].map((p) => paramPattern(test, p));
      if (index_lookup_expect === "unknown_building") {
        for (const e of INDEX_ENTRIES) for (const name of namesOf(e).building) expect(building.test(name), name).toBe(false);
        return;
      }
      const target = INDEX_ENTRIES.filter((e) => area.test(e.area) && building.test(e.building) && bedrooms.test(e.bedrooms));
      expect(target).toHaveLength(1);
      const names = namesOf(target[0]);
      for (const name of names.area) expect(area.test(name), name).toBe(true);
      for (const name of names.building) expect(building.test(name), name).toBe(true);
      for (const name of names.bedrooms) expect(bedrooms.test(name), name).toBe(true);
    },
  );

  const replies = items.filter((i) => i.category === "next_reply");
  it.each(replies.map((i) => ({ name: i.test.name, ...i })))(
    "$name: the index_lookup result in the history is exactly what the server returns",
    ({ test }) => {
      const call = test.chat_history.flatMap((t) => t.tool_calls ?? []).find((c) => c.tool_name === "index_lookup")!;
      const result = test.chat_history.flatMap((t) => t.tool_results ?? []).find((r) => r.tool_name === "index_lookup")!;
      expect(test.chat_history.at(-1)?.tool_results?.[0]?.tool_name).toBe("index_lookup");
      expect(JSON.parse(result.result_value)).toEqual(runRentCheck(intakeSchema.parse(JSON.parse(call.params_as_json))));
      expect(JSON.parse(result.result_value).outcome).toBe("checked");
    },
  );

  it("references the index_lookup tool in every tool call test", () => {
    for (const i of items.filter((x) => x.category === "tool_call")) {
      expect(i.test.tool_call_parameters?.referenced_tool.id).toBe(INDEX_LOOKUP_ID);
    }
  });
});
