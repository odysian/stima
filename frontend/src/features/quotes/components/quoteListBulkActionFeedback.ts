import type {
  BulkActionBlockedItem,
  BulkActionResponse,
  BulkActionType,
} from "@/features/quotes/types/quote.types";

interface BulkActionFeedback {
  kind: "success" | "warn";
  title: string;
  message: string;
}

function pluralize(noun: string, count: number): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatBlockedSummary(blocked: BulkActionBlockedItem[]): string {
  if (blocked.length === 0) {
    return "";
  }

  const uniqueMessages = Array.from(new Set(blocked.map((item) => item.message.trim()).filter(Boolean)));

  if (uniqueMessages.length === 0) {
    return `${pluralize("document", blocked.length)} were blocked.`;
  }

  if (uniqueMessages.length === 1) {
    return uniqueMessages[0] ?? "";
  }

  return uniqueMessages.map((message) => `- ${message}`).join(" ");
}

function actionPastTense(action: BulkActionType): string {
  return action === "archive" ? "archived" : "deleted";
}

export function buildBulkActionFeedback(response: BulkActionResponse): BulkActionFeedback {
  const actionVerb = actionPastTense(response.action);
  const appliedCount = response.applied.length;
  const blockedCount = response.blocked.length;
  const blockedSummary = formatBlockedSummary(response.blocked);

  if (appliedCount > 0 && blockedCount === 0) {
    return {
      kind: "success",
      title: response.action === "archive" ? "Archive complete" : "Delete complete",
      message: `${pluralize("document", appliedCount)} ${actionVerb}.`,
    };
  }

  if (appliedCount > 0) {
    return {
      kind: "warn",
      title: "Partially complete",
      message: `${pluralize("document", appliedCount)} ${actionVerb}. ${pluralize("document", blockedCount)} could not be ${actionVerb}. ${blockedSummary}`.trim(),
    };
  }

  return {
    kind: "warn",
    title: response.action === "archive" ? "No documents archived" : "No documents deleted",
    message: blockedSummary || `No documents were ${actionVerb}.`,
  };
}
