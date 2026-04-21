import { StateGraph, START, END } from "@langchain/langgraph";
import { SafeguardStateAnnotation, type GraphState } from "./state.ts";
import { createGuardrailsCheckNode } from "./nodes/guardrailsCheckNode.ts";
import { createChatNode } from "./nodes/chatNode.ts";
import { blockedNode } from "./nodes/blockedNode.ts";
import { routeAfterGuardrails } from "./nodes/edgeConditions.ts";
import { OpenRouterService } from "../services/openrouterService.ts";

export function buildChatGraph() {
  const openRouterService = new OpenRouterService();
  const workflow = new StateGraph({
    stateSchema: SafeguardStateAnnotation,
  })
    .addNode("guardrails_check", createGuardrailsCheckNode(openRouterService))
    .addNode("chat", createChatNode(openRouterService))
    .addNode("blocked", blockedNode)

    // Set entry point
    .addEdge(START, "guardrails_check")

    // Define conditional edge after guardrails check
    .addConditionalEdges(
      "guardrails_check",
      (state: GraphState) => routeAfterGuardrails(state),
      {
        chat: "chat",
        blocked: "blocked",
      },
    )

    // Both chat and blocked nodes end the flow
    .addEdge("chat", END)
    .addEdge("blocked", END);

  return workflow.compile();
}
