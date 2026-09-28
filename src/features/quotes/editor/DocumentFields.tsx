"use client";

import type { ChangeEvent } from "react";
import type { QuoteDocument, SupplierInfo } from "@/features/quotes/model";
import type { DocumentValidation } from "@/features/quotes/model";

export type EditorHandlers = {
  update: (patch: Partial<QuoteDocument>) => void;
  updateSupplier: (key: keyof SupplierInfo, value: string) => void;
};

export const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900";

export const SUPPLIER_FIELDS: { key: keyof SupplierInfo; label: string }[] = [
  { key: "companyName", label: "상호" },
  { key: "businessNumber", label: "사업자번호" },
  { key: "contactName", label: "담당자" },
  { key: "contactPhone", label: "연락처" },
  { key: "contactEmail", label: "이메일" },
  { key: "address", label: "주소" },
];

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold text-neutral-600">{children}</span>;
}

export function ErrorText({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return <p className="mt-0.5 text-xs text-red-600">{message}</p>;
}

type DocumentFieldsProps = EditorHandlers & {
  doc: QuoteDocument;
  validation: DocumentValidation;
  showErrors: boolean;
  showSupplier: boolean;
  onToggleSupplier: () => void;
  readOnly?: boolean;
};

export function DocumentFields({
  doc,
  validation,
  showErrors,
  showSupplier,
  onToggleSupplier,
  update,
  updateSupplier,
  readOnly = false,
}: DocumentFieldsProps) {
  const error = (field: string) =>
    showErrors ? validation.documentErrors.find((item) => item.field === field)?.message : undefined;

  const textInput = (
    key: "documentNumber" | "recipientCompany" | "validUntil" | "deliveryTerms" | "priceCondition",
  ) => ({
    className: inputClass,
    disabled: readOnly,
    onChange: (event: ChangeEvent<HTMLInputElement>) => update({ [key]: event.target.value }),
    value: doc[key],
  });

  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <h2 className="text-sm font-bold">문서 정보</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>문서 번호</FieldLabel>
          <input {...textInput("documentNumber")} />
          <ErrorText message={error("documentNumber")} />
        </label>
        <label className="block">
          <FieldLabel>버전</FieldLabel>
          <input className={inputClass} disabled readOnly value={doc.version} />
        </label>
        <label className="block">
          <FieldLabel>수신 회사명 (필수)</FieldLabel>
          <input {...textInput("recipientCompany")} />
          <ErrorText message={error("recipientCompany")} />
        </label>
        <label className="block">
          <FieldLabel>유효기한</FieldLabel>
          <input {...textInput("validUntil")} placeholder="YYYY-MM-DD" />
          <ErrorText message={error("validUntil")} />
        </label>
        <label className="block">
          <FieldLabel>납기·배송 조건</FieldLabel>
          <input {...textInput("deliveryTerms")} />
        </label>
        <label className="block">
          <FieldLabel>가격 조건 (세금 포함 여부 등)</FieldLabel>
          <input {...textInput("priceCondition")} placeholder="예: 부가세 별도 금액입니다." />
        </label>
        <label className="block sm:col-span-2">
          <FieldLabel>비고</FieldLabel>
          <textarea
            className={inputClass}
            disabled={readOnly}
            onChange={(event) => update({ notes: event.target.value })}
            rows={2}
            value={doc.notes}
          />
          <ErrorText message={error("notes")} />
        </label>
      </div>
      <button
        className="mt-3 text-xs font-semibold text-neutral-700 underline"
        onClick={onToggleSupplier}
        type="button"
      >
        {showSupplier ? "공급자 정보 닫기" : "공급자 정보 열기"}
      </button>
      {showSupplier ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SUPPLIER_FIELDS.map((field) => (
            <label className="block" key={field.key}>
              <FieldLabel>{field.label}</FieldLabel>
              <input
                className={inputClass}
                disabled={readOnly}
                onChange={(event) => updateSupplier(field.key, event.target.value)}
                value={doc.supplier[field.key]}
              />
            </label>
          ))}
          <p className="text-xs text-neutral-500 sm:col-span-2">
            여기서 바꾼 공급자 정보는 앞으로 만들 견적에만 적용됩니다. 이미 확정한 버전에는 소급되지
            않습니다.
          </p>
        </div>
      ) : null}
    </section>
  );
}
