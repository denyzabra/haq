import { isConversationId, readFlows } from "@/lib/flows";
import { getStore } from "@/lib/store";

// Read only: which server side flows have happened for one conversation.
// Returns flow numbers and timestamps only, never content.
export async function GET(_request: Request, ctx: RouteContext<"/api/flows/[conversationId]">) {
  const { conversationId } = await ctx.params;
  if (!isConversationId(conversationId)) return Response.json({ error: "invalid conversation id" }, { status: 400 });
  const flows = await readFlows(getStore(), conversationId);
  return Response.json({ conversation_id: conversationId, flows }, { headers: { "Cache-Control": "no-store" } });
}
