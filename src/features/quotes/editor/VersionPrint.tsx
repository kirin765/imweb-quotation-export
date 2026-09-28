"use client";

import Link from "next/link";

import { formatDateTime, type QuoteDocument } from "@/features/quotes/model";
import { downloadXlsx } from "@/features/quotes/client-export";
import { QuotePrintSheet } from "@/features/quotes/print/PrintPreview";

/** 확정 시점 snapshot을 그대로 인쇄·내보내기한다. 초안 화면과 달리 편집할 수 없다. */
export function VersionPrint({
  doc,
  confirmedAt,
  draftId,
}: {
  doc: QuoteDocument;
  confirmedAt: string;
  draftId?: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full flex-wrap items-center justify-between gap-4 px-2">
        <div className="text-xs text-neutral-700">
          <p className="font-semibold">
            확정본 v{doc.version} · {formatDateTime(confirmedAt)}
          </p>
          <p>
            확정한 시점의 내용 그대로입니다. 이후 초안을 고쳐도 이 화면과 내보내기는 바뀌지 않습니다.
            XLSX도 확정값이며 자동 재계산 수식은 넣지 않습니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href={draftId ? `/quotes/${draftId}` : "/quotes"}
          >
            {draftId ? "초안으로" : "목록으로"}
          </Link>
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={() => downloadXlsx(doc)}
            type="button"
          >
            XLSX 다운로드
          </button>
          <button
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => window.print()}
            type="button"
          >
            인쇄 / PDF로 저장
          </button>
        </div>
      </div>
      <QuotePrintSheet doc={doc} />
    </div>
  );
}
