"use client";

import { useState } from "react";
import {
  adjustmentAmount,
  formatDateTime,
  formatKrw,
  lineAmount,
  type QuoteDocument,
} from "@/features/quotes/model";
import { loadDocument } from "@/features/quotes/storage";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      <span className="whitespace-pre-wrap break-words">{value === "" ? "-" : value}</span>
    </div>
  );
}

export function QuotePrintSheet({ doc }: { doc: QuoteDocument }) {
  const subtotal = doc.items.reduce((sum, item) => sum + lineAmount(item), 0);
  const adjustment = adjustmentAmount(doc.adjustment);
  const total = subtotal + adjustment;

  return (
    <article className="print-sheet mx-auto w-[210mm] max-w-full bg-white p-[14mm] text-neutral-900 shadow-sm print:w-auto print:p-0 print:shadow-none">
      <header className="border-b-2 border-neutral-900 pb-3">
        <h1 className="text-2xl font-bold tracking-[0.3em]">견적서</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
          <span>문서번호 {doc.documentNumber}</span>
          <span>버전 v{doc.version}</span>
          <span>작성시각 {formatDateTime(doc.createdAt)}</span>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <h2 className="mb-2 text-sm font-bold">공급자</h2>
          <InfoRow label="상호" value={doc.supplier.companyName} />
          <InfoRow label="사업자번호" value={doc.supplier.businessNumber} />
          <InfoRow label="담당" value={doc.supplier.contactName} />
          <InfoRow label="연락처" value={doc.supplier.contactPhone} />
          <InfoRow label="이메일" value={doc.supplier.contactEmail} />
          <InfoRow label="주소" value={doc.supplier.address} />
        </div>
        <div className="space-y-1">
          <h2 className="mb-2 text-sm font-bold">수신</h2>
          <InfoRow label="회사명" value={doc.recipientCompany} />
          <InfoRow label="유효기한" value={doc.validUntil} />
          <InfoRow label="납기·배송" value={doc.deliveryTerms} />
          <InfoRow label="가격 조건" value={doc.priceCondition} />
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-neutral-100">
            <th className="border border-neutral-300 px-2 py-1.5 text-center font-semibold">순번</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-left font-semibold">품목 코드</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-left font-semibold">상품명</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-left font-semibold">옵션</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">수량</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">단가</th>
            <th className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">금액</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={item.id} className="align-top">
              <td className="border border-neutral-300 px-2 py-1.5 text-center">{index + 1}</td>
              <td className="border border-neutral-300 px-2 py-1.5 break-all">{item.itemCode}</td>
              <td className="border border-neutral-300 px-2 py-1.5 break-words">
                {item.productName}
              </td>
              <td className="border border-neutral-300 px-2 py-1.5 break-words">
                {item.optionName}
              </td>
              <td className="border border-neutral-300 px-2 py-1.5 text-right">
                {item.quantity.toLocaleString("ko-KR")}
              </td>
              <td className="border border-neutral-300 px-2 py-1.5 text-right">
                {item.unitPrice.toLocaleString("ko-KR")}
              </td>
              <td className="border border-neutral-300 px-2 py-1.5 text-right">
                {lineAmount(item).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">
              상품 합계
            </td>
            <td className="border border-neutral-300 px-2 py-1.5 text-right font-semibold">
              {subtotal.toLocaleString("ko-KR")}
            </td>
          </tr>
          {doc.adjustment ? (
            <tr>
              <td colSpan={6} className="border border-neutral-300 px-2 py-1.5 text-right">
                조정 · {doc.adjustment.description}
              </td>
              <td className="border border-neutral-300 px-2 py-1.5 text-right">
                {adjustment.toLocaleString("ko-KR")}
              </td>
            </tr>
          ) : null}
          <tr className="bg-neutral-100">
            <td colSpan={6} className="border border-neutral-300 px-2 py-1.5 text-right font-bold">
              견적 총액
            </td>
            <td className="border border-neutral-300 px-2 py-1.5 text-right font-bold">
              {total.toLocaleString("ko-KR")}
            </td>
          </tr>
        </tfoot>
      </table>

      {doc.priceCondition.trim() !== "" ? (
        <p className="mt-3 text-xs text-neutral-700">{doc.priceCondition}</p>
      ) : null}

      {doc.notes.trim() !== "" ? (
        <section className="mt-4">
          <h2 className="text-sm font-bold">비고</h2>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs">{doc.notes}</p>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-600">
        <p>
          본 견적서는 주문 전 제안이며 결제 완료 또는 주문 생성을 의미하지 않습니다. 총액은{" "}
          {formatKrw(total)}이고, 세금 처리는 &lsquo;가격 조건&rsquo;에 따릅니다.
        </p>
        <p>
          문서번호 {doc.documentNumber} · 버전 v{doc.version} · 작성시각{" "}
          {formatDateTime(doc.createdAt)}
        </p>
        <p>
          앱에서 수정한 내용은 이 화면에 반영되지만, 이미 내보낸 XLSX/PDF 파일과 저장된 사본은
          자동으로 동기화되지 않습니다.
        </p>
      </footer>
    </article>
  );
}

export function PrintPreview() {
  const [doc] = useState<QuoteDocument | null>(() => loadDocument());

  if (!doc) {
    return (
      <div className="no-print mx-auto max-w-lg p-8 text-sm">
        <p className="font-semibold">인쇄할 견적이 없습니다.</p>
        <p className="mt-2 text-neutral-600">
          데모 편집 화면에서 견적을 작성한 뒤 다시 인쇄 화면을 열어 주세요.
        </p>
        <a className="mt-4 inline-block font-semibold text-blue-700 underline" href="/demo">
          데모 편집 화면으로 이동
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-4 px-2">
        <div className="text-xs text-neutral-700">
          <p className="font-semibold">인쇄 미리보기</p>
          <p>
            브라우저 인쇄 대화상자에서 대상 &lsquo;PDF로 저장&rsquo;을 선택하세요. 이 데모는 PDF
            파일을 직접 생성하지 않습니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href="/demo"
          >
            편집으로 돌아가기
          </a>
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
