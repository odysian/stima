import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvoiceDetailScreen } from "@/features/invoices/components/InvoiceDetailScreen";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { JobStatusResponse } from "@/features/quotes/types/quote.types";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { jobService } from "@/shared/lib/jobService";

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    getInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    generatePdf: vi.fn(),
    shareInvoice: vi.fn(),
    revokeShare: vi.fn(),
    markInvoicePaid: vi.fn(),
    markInvoiceVoid: vi.fn(),
    sendInvoiceEmail: vi.fn(),
  },
}));

vi.mock("@/shared/lib/jobService", () => ({
  jobService: {
    getJobStatus: vi.fn(),
  },
}));

const mockedInvoiceService = vi.mocked(invoiceService);
const mockedJobService = vi.mocked(jobService);

function makePdfArtifact(
  overrides: Partial<InvoiceDetail["pdf_artifact"]> = {},
): InvoiceDetail["pdf_artifact"] {
  return {
    status: "missing",
    job_id: null,
    download_url: null,
    terminal_error: null,
    ...overrides,
  };
}

function makeInvoiceDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const hasActiveShare = overrides.has_active_share ?? Boolean(overrides.share_token);

  return {
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "draft",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    has_active_share: hasActiveShare,
    source_document_id: "quote-1",
    source_quote_number: "Q-001",
    pdf_artifact: makePdfArtifact(),
    customer: {
      id: "cust-1",
      name: "Alice Johnson",
      email: "alice@example.com",
      phone: "+1-555-0100",
    },
    line_items: [
      {
        id: "line-1",
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
        sort_order: 0,
      },
    ],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "draft",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    source_document_id: "quote-1",
    line_items: [
      {
        id: "line-1",
        description: "Brown mulch",
        details: "5 yards",
        price: 120,
        sort_order: 0,
      },
    ],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function renderScreen(path = "/invoices/invoice-1"): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailScreen />} />
        <Route path="/documents/:id/edit" element={<div>Document Edit Screen</div>} />
        <Route path="/quotes/:id/preview" element={<div>Quote Preview Screen</div>} />
        <Route path="/" element={<div>Quote List Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openOverflowMenu(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /more actions/i }));
}

beforeEach(() => {
  const pendingEmailJob: JobStatusResponse = {
    id: "job-email-invoice-1",
    user_id: "user-1",
    document_id: "invoice-1",
    document_revision: null,
    job_type: "email",
    status: "pending",
    attempts: 0,
    terminal_error: null,
    extraction_result: null,
    quote_id: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
  const pendingPdfJob: JobStatusResponse = {
    ...pendingEmailJob,
    id: "job-pdf-invoice-1",
    document_revision: 0,
    job_type: "pdf",
  };
  const successfulPdfJob: JobStatusResponse = {
    ...pendingPdfJob,
    status: "success",
    attempts: 1,
  };

  vi.clearAllMocks();
  mockedInvoiceService.getInvoice.mockResolvedValue(makeInvoiceDetail());
  mockedInvoiceService.generatePdf.mockResolvedValue(pendingPdfJob);
  mockedInvoiceService.shareInvoice.mockResolvedValue(
    makeInvoice({
      status: "sent",
      share_token: "invoice-share-token-1",
      shared_at: "2026-03-20T00:15:00.000Z",
      updated_at: "2026-03-20T00:15:00.000Z",
    }),
  );
  mockedInvoiceService.revokeShare.mockResolvedValue(undefined);
  mockedInvoiceService.markInvoicePaid.mockResolvedValue(
    makeInvoice({
      status: "paid",
      share_token: "invoice-share-token-1",
      shared_at: "2026-03-20T00:15:00.000Z",
      updated_at: "2026-03-20T00:20:00.000Z",
    }),
  );
  mockedInvoiceService.markInvoiceVoid.mockResolvedValue(
    makeInvoice({
      status: "void",
      share_token: "invoice-share-token-1",
      shared_at: "2026-03-20T00:15:00.000Z",
      updated_at: "2026-03-20T00:20:00.000Z",
    }),
  );
  mockedInvoiceService.sendInvoiceEmail.mockResolvedValue(pendingEmailJob);
  mockedJobService.getJobStatus.mockResolvedValue(successfulPdfJob);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("InvoiceDetailScreen", () => {
  it("loads the invoice detail, shows the source quote link, and exposes edit", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Invoice Preview" })).toBeInTheDocument();
    expect(screen.queryByText(/created on /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/created from quote/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open linked quote q-001/i })).toBeInTheDocument();
    const utilities = screen.getByRole("group", { name: /invoice utilities/i });
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(within(utilities).queryByRole("button", { name: /back to q-001/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.getByText("Thanks for your business")).toBeInTheDocument();
    expect(screen.getByText("Apr 19, 2026")).toBeInTheDocument();
    expect(screen.getByText("INVOICE")).toBeInTheDocument();
    expect(screen.getByText("+1-555-0100")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });

  it("hides source quote UI for direct invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        source_document_id: null,
        source_quote_number: null,
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Invoice Preview" })).toBeInTheDocument();
    expect(screen.queryByText(/created on /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/created from quote/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open linked quote/i })).not.toBeInTheDocument();
  });

  it("keeps sent invoices editable by leaving the edit action available", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Invoice Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.queryByText(/sent invoices are read-only/i)).not.toBeInTheDocument();
  });

  it("shows Send Email for ready invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "ready",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("button", { name: /send email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend email/i })).not.toBeInTheDocument();
  });

  it("shows Resend Email for sent invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("button", { name: /resend email/i })).toBeInTheDocument();
  });

  it("shows revoke link for active shares and refetches detail after revocation", async () => {
    mockedInvoiceService.getInvoice
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "sent",
          share_token: "invoice-share-token-1",
          has_active_share: true,
          shared_at: "2026-03-20T00:15:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "sent",
          share_token: "invoice-share-token-1",
          has_active_share: false,
          shared_at: "2026-03-20T00:15:00.000Z",
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /revoke link/i }));

    const dialog = screen.getByRole("dialog", { name: /revoke share link\?/i });
    expect(
      within(dialog).getByText("Anyone with this link will no longer be able to view this document."),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /revoke link/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.revokeShare).toHaveBeenCalledWith("invoice-1");
    });
    await waitFor(() => {
      expect(mockedInvoiceService.getInvoice).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Share link revoked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();

    await openOverflowMenu();
    expect(screen.queryByRole("menuitem", { name: /revoke link/i })).not.toBeInTheDocument();
  });

  it("shows both outcome actions in overflow for sent invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });
    await openOverflowMenu();

    expect(screen.getByRole("menuitem", { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /mark as void/i })).toBeInTheDocument();
  });

  it("shows paid banner and only Mark as Void in overflow for paid invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "paid",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    expect(await screen.findByText("This invoice is marked as paid.")).toBeInTheDocument();
    await openOverflowMenu();

    expect(screen.queryByRole("menuitem", { name: /mark as paid/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /mark as void/i })).toBeInTheDocument();
  });

  it("shows void banner and only Mark as Paid in overflow for void invoices", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "void",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    expect(await screen.findByText("This invoice is marked as void.")).toBeInTheDocument();
    await openOverflowMenu();

    expect(screen.getByRole("menuitem", { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /mark as void/i })).not.toBeInTheDocument();
  });

  it.each(["paid", "void"] as const)(
    "keeps edit/share/pdf/email actions available for %s invoices",
    async (status) => {
      mockedInvoiceService.getInvoice.mockResolvedValueOnce(
        makeInvoiceDetail({
          status,
          share_token: "invoice-share-token-1",
          shared_at: "2026-03-20T00:15:00.000Z",
          pdf_artifact: makePdfArtifact({
            status: "ready",
            download_url: "/api/invoices/invoice-1/pdf",
          }),
        }),
      );

      renderScreen();

      expect(await screen.findByRole("button", { name: /edit invoice/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
    },
  );

  it("marks a sent invoice as paid from overflow and updates visible state", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark as paid/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.markInvoicePaid).toHaveBeenCalledWith("invoice-1");
    });

    expect(await screen.findByText("This invoice is marked as paid.")).toBeInTheDocument();
  });

  it("marks a paid invoice as void from overflow and updates visible state", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "paid",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark as void/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.markInvoiceVoid).toHaveBeenCalledWith("invoice-1");
    });

    expect(await screen.findByText("This invoice is marked as void.")).toBeInTheDocument();
  });

  it("hides the email action for draft invoices", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Invoice Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend email/i })).not.toBeInTheDocument();
  });

  it("keeps the utility row single-column when email actions are unavailable", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });

    const utilities = screen.getByRole("group", { name: /invoice utilities/i });
    expect(utilities).toHaveClass("grid-cols-1");
    expect(utilities).not.toHaveClass("grid-cols-2");
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("disables the email action and shows a hint when the customer email is missing", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "ready",
        customer: {
          id: "cust-1",
          name: "Alice Johnson",
          email: null,
          phone: "+1-555-0100",
        },
      }),
    );

    renderScreen();

    const sendButton = await screen.findByRole("button", { name: /send email/i });
    expect(sendButton).toBeDisabled();
    expect(
      screen.getByText("Add a customer email to send this invoice via email. Copy Link still works."),
    ).toBeInTheDocument();
  });

  it("renders the client card before the open linked quote action", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });

    const clientHeading = screen.getByText("CLIENT");
    const linkedQuoteAction = screen.getByRole("button", { name: /open linked quote q-001/i });

    expect(clientHeading.compareDocumentPosition(linkedQuoteAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides customer notes when the invoice notes are blank", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        notes: "   ",
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });
    expect(screen.queryByText("Customer Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("No customer notes")).not.toBeInTheDocument();
  });

  it("falls back to email in the client card when the phone number is missing", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        customer: {
          id: "cust-1",
          name: "Alice Johnson",
          email: "alice@example.com",
          phone: null,
        },
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("navigates to the invoice editor when edit is clicked", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /edit invoice/i }));

    expect(await screen.findByText("Document Edit Screen")).toBeInTheDocument();
  });

  it("shares the invoice using the raw /share token URL", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.shareInvoice).toHaveBeenCalledWith("invoice-1");
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "http://localhost:3000/share/invoice-share-token-1",
    );
    expect(await screen.findByText("Invoice link copied to clipboard.")).toBeInTheDocument();
  });

  it("shows the manual-copy URL when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "sent",
        share_token: "invoice-share-token-1",
        shared_at: "2026-03-20T00:15:00.000Z",
      }),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /copy link/i }));

    expect(await screen.findByLabelText("Share URL")).toHaveValue(
      "http://localhost:3000/share/invoice-share-token-1",
    );
    expect(await screen.findByText("Copy this share link manually.")).toBeInTheDocument();
  });

  it("preserves the ready PDF link after sharing the invoice", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        pdf_artifact: makePdfArtifact({
          status: "ready",
          download_url: "/api/invoices/invoice-1/pdf",
        }),
      }),
    );
    renderScreen();

    const openPdfLink = (await screen.findByText("Open PDF")).closest("a");
    expect(openPdfLink).toHaveAttribute("href", "/api/invoices/invoice-1/pdf");

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.shareInvoice).toHaveBeenCalledWith("invoice-1");
    });
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "/api/invoices/invoice-1/pdf",
    );
  });

  it("opens a confirmation modal before sending and closes it on cancel", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "ready",
      }),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /send email/i }));

    expect(screen.getByText(/alice@example\.com/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText(/alice@example\.com/i)).not.toBeInTheDocument();
    });
    expect(mockedInvoiceService.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("sends invoice email after confirmation, shows in-flight state, and updates local invoice state", async () => {
    mockedInvoiceService.getInvoice
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "ready",
        }),
      )
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "sent",
          share_token: "invoice-share-token-1",
          shared_at: "2026-03-20T00:15:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "sent",
          share_token: "invoice-share-token-1",
          shared_at: "2026-03-20T00:15:00.000Z",
        }),
      );

    let resolveSend!: (job: JobStatusResponse) => void;
    const sendPromise = new Promise<JobStatusResponse>((resolve) => {
      resolveSend = resolve;
    });
    mockedInvoiceService.sendInvoiceEmail.mockReturnValueOnce(sendPromise);

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /send email/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Send Email$/i }));

    expect(
      await screen.findByRole("button", { name: /sending/i }),
    ).toBeDisabled();
    expect(screen.queryByText(/alice@example\.com/i)).not.toBeInTheDocument();

    resolveSend(
      {
        id: "job-email-invoice-1",
        user_id: "user-1",
        document_id: "invoice-1",
        document_revision: null,
        job_type: "email",
        status: "pending",
        attempts: 0,
        terminal_error: null,
        extraction_result: null,
        quote_id: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      },
    );

    await waitFor(() => {
      expect(mockedInvoiceService.sendInvoiceEmail).toHaveBeenCalledWith("invoice-1");
    });
    expect(await screen.findByText("Invoice sent by email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
  });

  it("dismisses the confirmation modal and shows the backend detail when sending fails", async () => {
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(
      makeInvoiceDetail({
        status: "ready",
      }),
    );
    mockedInvoiceService.sendInvoiceEmail.mockRejectedValueOnce(
      new Error("Email delivery failed. Please try again."),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /send email/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Send Email$/i }));

    expect(await screen.findByText("Email delivery failed. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/alice@example\.com/i)).not.toBeInTheDocument();
  });

  it("resumes a pending PDF job on mount and refreshes the invoice to ready", async () => {
    mockedInvoiceService.getInvoice
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          pdf_artifact: makePdfArtifact({ status: "pending", job_id: "job-pdf-invoice-1" }),
        }),
      )
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          status: "ready",
          pdf_artifact: makePdfArtifact({
            status: "ready",
            download_url: "/api/invoices/invoice-1/pdf",
          }),
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });

    await waitFor(() => {
      expect(mockedJobService.getJobStatus).toHaveBeenCalledWith("job-pdf-invoice-1");
    });

    expect(await screen.findByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "/api/invoices/invoice-1/pdf",
    );
  });

  it("resumes a pending PDF job on mount and refreshes the invoice to failed", async () => {
    mockedJobService.getJobStatus.mockResolvedValueOnce({
      id: "job-pdf-invoice-1",
      user_id: "user-1",
      document_id: "invoice-1",
      document_revision: 0,
      job_type: "pdf",
      status: "terminal",
      attempts: 1,
      terminal_error: "render_failed",
      extraction_result: null,
      quote_id: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:01:00.000Z",
    });
    mockedInvoiceService.getInvoice
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          pdf_artifact: makePdfArtifact({ status: "pending", job_id: "job-pdf-invoice-1" }),
        }),
      )
      .mockResolvedValueOnce(
        makeInvoiceDetail({
          pdf_artifact: makePdfArtifact({
            status: "failed",
            job_id: "job-pdf-invoice-1",
            terminal_error: "render_failed",
          }),
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Invoice Preview" });

    await waitFor(() => {
      expect(mockedJobService.getJobStatus).toHaveBeenCalledWith("job-pdf-invoice-1");
    });

    expect(await screen.findByText("Invoice PDF failed. Please try again.")).toBeInTheDocument();
  });

  it("falls back to the quote list when back navigation is unsafe", async () => {
    window.history.replaceState({ idx: 0 }, "");

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /back/i }));

    expect(await screen.findByText("Quote List Screen")).toBeInTheDocument();
  });
});
