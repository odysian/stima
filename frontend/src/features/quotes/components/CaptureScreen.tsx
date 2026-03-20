import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import { Button } from "@/shared/components/Button";

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();
  const { setDraft } = useQuoteDraft();

  const [notes, setNotes] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = notes.trim().length > 0 && !isExtracting;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!customerId) {
      setError("Missing customer context. Please select a customer again.");
      return;
    }

    setError(null);
    setIsExtracting(true);

    try {
      const extraction = await quoteService.convertNotes(notes.trim());
      setDraft({
        customerId,
        transcript: extraction.transcript,
        lineItems: extraction.line_items,
        total: extraction.total,
        confidenceNotes: extraction.confidence_notes,
        notes: "",
      });
      navigate("/quotes/review");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Unable to extract line items";
      setError(message);
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Capture quote notes</h1>
        <p className="mb-6 text-sm text-slate-600">
          Enter job notes in plain text. We&apos;ll extract draft line items for review.
        </p>

        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1">
            <label htmlFor="quote-notes" className="text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id="quote-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="5 yards brown mulch, edge front beds..."
              rows={10}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {isExtracting ? (
            <p role="status" className="text-sm text-slate-700">
              Extracting line items...
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit} isLoading={isExtracting}>
              Generate Draft
            </Button>
            <Button type="button" onClick={() => navigate("/quotes/new")}>
              Back
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
