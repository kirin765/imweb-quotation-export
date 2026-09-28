"use client";

import {
  formatKrw,
  parseIntegerInput,
  type DocumentValidation,
  type QuoteDocument,
} from "@/features/quotes/model";
import { ErrorText, FieldLabel, inputClass } from "./DocumentFields";

type AdjustmentFieldsProps = {
  doc: QuoteDocument;
  validation: DocumentValidation;
  showErrors: boolean;
  update: (patch: Partial<QuoteDocument>) => void;
  readOnly?: boolean;
};

export function AdjustmentFields({
  doc,
  validation,
  showErrors,
  update,
  readOnly = false,
}: AdjustmentFieldsProps) {
  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <h2 className="text-sm font-bold">조정 금액</h2>
      <p className="mt-1 text-xs text-neutral-600">
        배송비나 일괄 할인처럼 품목에 담기 어려운 금액입니다. 설명을 반드시 입력하고, 할인은 음수로
        넣습니다.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>설명</FieldLabel>
          <input
            className={inputClass}
            disabled={readOnly || !doc.adjustment}
            onChange={(event) =>
              update({
                adjustment: doc.adjustment
                  ? { ...doc.adjustment, description: event.target.value }
                  : null,
              })
            }
            placeholder="예: 배송비, 일괄 할인"
            value={doc.adjustment?.description ?? ""}
          />
        </label>
        <label className="block">
          <FieldLabel>금액(원)</FieldLabel>
          <input
            className={`${inputClass} text-right`}
            disabled={readOnly || !doc.adjustment}
            inputMode="numeric"
            onChange={(event) =>
              update({
                adjustment: doc.adjustment
                  ? { ...doc.adjustment, amount: parseIntegerInput(event.target.value, true) }
                  : null,
              })
            }
            value={doc.adjustment?.amount ?? 0}
          />
        </label>
      </div>
      <ErrorText message={showErrors ? (validation.adjustmentError ?? undefined) : undefined} />
      {readOnly ? null : (
        <button
          className="mt-3 text-xs font-semibold text-neutral-700 underline"
          onClick={() =>
            update({ adjustment: doc.adjustment ? null : { description: "", amount: 0 } })
          }
          type="button"
        >
          {doc.adjustment ? "조정 금액 사용 안 함" : "조정 금액 추가"}
        </button>
      )}
    </section>
  );
}

export function TotalsPanel({
  doc,
  validation,
  showErrors,
}: {
  doc: QuoteDocument;
  validation: DocumentValidation;
  showErrors: boolean;
}) {
  const totalError = showErrors
    ? validation.documentErrors.find((error) => error.field === "total")?.message
    : undefined;

  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <h2 className="text-sm font-bold">미리보기 합계</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-600">상품 합계</dt>
          <dd>{formatKrw(validation.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-600">
            조정 {doc.adjustment ? `(${doc.adjustment.description || "설명 없음"})` : ""}
          </dt>
          <dd>{formatKrw(validation.adjustmentAmount)}</dd>
        </div>
        <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-bold">
          <dt>견적 총액</dt>
          <dd>{formatKrw(validation.total)}</dd>
        </div>
      </dl>
      <ErrorText message={totalError} />
      <p className="mt-2 text-xs text-neutral-500">
        부가세는 자동 계산하지 않습니다. &lsquo;가격 조건&rsquo;에 세금 포함 여부를 적어 주세요.
      </p>
    </section>
  );
}

export function CalculationNote() {
  return (
    <section className="rounded border border-neutral-300 bg-white p-4 text-xs text-neutral-600">
      <h2 className="text-sm font-bold text-neutral-900">계산 기준</h2>
      <p className="mt-2">행 금액 = 수량 × 단가</p>
      <p>상품 합계 = 행 금액 합계</p>
      <p>견적 총액 = 상품 합계 + 조정 금액 (0원 미만 불가)</p>
      <p className="mt-2">
        금액은 원 단위 정수로만 계산합니다. 화면·XLSX·PDF는 같은 문서 데이터를 사용합니다.
      </p>
    </section>
  );
}
