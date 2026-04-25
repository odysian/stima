import { quoteService } from "@/features/quotes/services/quoteService";

export async function createManualDraftForCapture(customerId: string | undefined): Promise<string> {
  const manualDraft = await quoteService.createManualDraft({ customerId });
  return manualDraft.id;
}
