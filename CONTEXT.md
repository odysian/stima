# CONTEXT.md — Stima Domain Language

## Purpose

Canonical glossary for Stima's product and domain language. Agents, reviewers, and operators should check this file when naming concepts, writing issue titles, or building acceptance criteria. Keep entries focused on user-meaningful product concepts — not implementation structure.

Update inline during planning discussions as terms are resolved. Do not add backlog tasks or implementation details here.

## Language

| Term | Definition |
| --- | --- |
| **Capture** | The act of uploading or photographing a source document (invoice, proposal, handwritten quote) that will be processed by the system. A Capture creates a Job. |
| **Extraction** | The automated process of reading a Capture and identifying structured data (line items, totals, provider info) from it. Extraction runs as a background Job. Narrow to the structured-data-parsing step only — not the full Capture-to-Quote pipeline. |
| **Quote Draft** | The intermediate representation of an extracted or manually entered quote, still under review. A Quote Draft can be edited before being confirmed as a Quote. Prefer the full term in issue titles to avoid confusion with "Quote". |
| **Quote** | A confirmed, finalized record representing a vendor's price offer for a set of Line Items. A Quote is what gets compared, shared, and acted on. |
| **Review** | The user-facing step where a Quote Draft is inspected, corrected, and approved before becoming a Quote. Review is an explicit user action. When ambiguous, use "Quote Review" to distinguish from code/PR review. |
| **Share** | The act of creating, reusing, copying, or distributing an active public link for a confirmed Quote or Invoice so stakeholders can view it. A Share can later be revoked or rotated; sharing does not itself end the editing lifecycle unless a separate status/lifecycle rule says so. |
| **Line Item** | A single row in a Quote or Quote Draft, representing one product, service, or charge with a quantity and price. |
| **Notes** | Free-text annotations attached to a Quote, Quote Draft, or Line Item, intended to persist human context that extraction cannot capture. |
| **Customer Match** | The process of linking a Capture or Quote to an existing Customer record, either automatically or via user confirmation. |
| **Customer** | A person or business entity that receives quotes. A Customer can have many Quotes. |
| **Provider** | A vendor or supplier who provides pricing. Quotes originate from Providers. |
| **Job** | A background task that processes a Capture through Extraction, tracking state and progress for async work. |

## Relationships

```
Customer → (many) Quotes
Provider → (many) Quotes
Capture → Job → Extraction → Quote Draft → (Review) → Quote → (Share link)
Quote → (many) Line Items
Quote → Notes
Line Item → Notes
```

## Example Dialogue

- "The Capture failed because the image was too dark" — the upload/photo step failed, not the extraction.
- "Extraction returned three Line Items" — the system identified three rows in the source document.
- "The user is in Review" — the user is on the Quote Draft review screen, correcting extracted data.
- "The Quote is ready to Share" — the Quote has been confirmed and can have an active public link created or reused.

## Flagged Ambiguities

- **"Quote" vs "Quote Draft"**: In casual use, "quote" sometimes means "quote draft." Use the full term in issue titles and acceptance criteria.
- **"Review"**: Overloaded — can mean the product step (user reviews a Quote Draft) or a code/PR review. Use "Quote Review" or "document review" if the context is ambiguous.
- **"Extraction"**: Sometimes used loosely for the entire Capture-to-Quote pipeline. Keep it scoped to the structured-data-parsing step only.
