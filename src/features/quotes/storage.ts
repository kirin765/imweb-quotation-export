import type { QuoteDocument } from "./model";

export const DEMO_STORAGE_KEY = "imweb-quotation-export:current-draft";

function isQuoteDocument(value: unknown): value is QuoteDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<QuoteDocument>;
  return (
    typeof candidate.documentNumber === "string" &&
    typeof candidate.recipientCompany === "string" &&
    Array.isArray(candidate.items) &&
    (candidate.supplier === undefined || typeof candidate.supplier === "object")
  );
}

export function saveDocument(doc: QuoteDocument): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    return;
  }
}

export function loadDocument(): QuoteDocument | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isQuoteDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
