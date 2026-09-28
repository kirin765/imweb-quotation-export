"use client";

import type { QuoteDocument } from "./model";
import { documentToXlsx, xlsxFileName } from "./xlsx";
import { saveDocument } from "./storage";

/** 브라우저에서 XLSX를 만들어 내려받는다. 서버 왕복 없이 같은 문서 데이터를 쓴다. */
export function downloadXlsx(doc: QuoteDocument): string {
  const bytes = documentToXlsx(doc);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = xlsxFileName(doc);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return xlsxFileName(doc);
}

/** 현재 문서를 localStorage에 두고 인쇄 전용 화면을 새 창으로 연다. */
export function openPrintWindow(doc: QuoteDocument, path = "/print"): void {
  saveDocument(doc);
  window.open(path, "_blank", "noopener,noreferrer");
}

/** 내보내기 이벤트를 감사 로그에 남긴다. 실패해도 다운로드를 막지 않는다. */
export function recordExportEvent(draftId: string, format: string): void {
  void fetch(`/api/quotes/${draftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "export", format }),
    keepalive: true,
  }).catch(() => undefined);
}
