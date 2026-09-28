"use client";

import {
  lineAmount,
  parseIntegerInput,
  type DocumentValidation,
  type QuoteItem,
} from "@/features/quotes/model";
import { ErrorText, inputClass } from "./DocumentFields";

type ItemsTableProps = {
  items: readonly QuoteItem[];
  validation: DocumentValidation;
  showErrors: boolean;
  updateItem: (id: string, patch: Partial<QuoteItem>) => void;
  removeItem: (id: string) => void;
  readOnly?: boolean;
};

export function ItemsTable({
  items,
  validation,
  showErrors,
  updateItem,
  removeItem,
  readOnly = false,
}: ItemsTableProps) {
  const errorOf = (index: number, field: keyof QuoteItem) =>
    showErrors ? validation.itemErrors[index]?.[field] : undefined;

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs text-neutral-600">
            <th className="w-8 py-1">#</th>
            <th className="w-32 py-1">품목 코드</th>
            <th className="py-1">상품명 (필수)</th>
            <th className="w-32 py-1">옵션</th>
            <th className="w-24 py-1">수량</th>
            <th className="w-28 py-1">단가(원)</th>
            <th className="w-28 py-1 text-right">금액</th>
            {readOnly ? null : <th className="w-16 py-1" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr className="border-b border-neutral-200 align-top" key={item.id}>
              <td className="py-1 text-xs text-neutral-500">{index + 1}</td>
              <td className="py-1 pr-1">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  onChange={(event) => updateItem(item.id, { itemCode: event.target.value })}
                  value={item.itemCode}
                />
                <ErrorText message={errorOf(index, "itemCode")} />
              </td>
              <td className="py-1 pr-1">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  onChange={(event) => updateItem(item.id, { productName: event.target.value })}
                  value={item.productName}
                />
                <ErrorText message={errorOf(index, "productName")} />
              </td>
              <td className="py-1 pr-1">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  onChange={(event) => updateItem(item.id, { optionName: event.target.value })}
                  value={item.optionName}
                />
                <ErrorText message={errorOf(index, "optionName")} />
              </td>
              <td className="py-1 pr-1">
                <input
                  className={`${inputClass} text-right`}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(event) =>
                    updateItem(item.id, { quantity: parseIntegerInput(event.target.value) })
                  }
                  value={item.quantity}
                />
                <ErrorText message={errorOf(index, "quantity")} />
              </td>
              <td className="py-1 pr-1">
                <input
                  className={`${inputClass} text-right`}
                  disabled={readOnly}
                  inputMode="numeric"
                  onChange={(event) =>
                    updateItem(item.id, { unitPrice: parseIntegerInput(event.target.value) })
                  }
                  value={item.unitPrice}
                />
                <ErrorText message={errorOf(index, "unitPrice")} />
              </td>
              <td className="py-1 text-right text-sm whitespace-nowrap">
                {lineAmount(item).toLocaleString("ko-KR")}
              </td>
              {readOnly ? null : (
                <td className="py-1 text-right">
                  <button
                    className="text-xs text-red-600 underline"
                    onClick={() => removeItem(item.id)}
                    type="button"
                  >
                    삭제
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
