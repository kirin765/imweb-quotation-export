import { describe, expect, it } from "vitest";
import {
  MAX_QUANTITY,
  MAX_UNIT_PRICE,
  documentTotal,
  formatKrw,
  itemsSubtotal,
  lineAmount,
  parseIntegerInput,
  sanitizeFileNamePart,
  validateDocument,
  type QuoteDocument,
  type QuoteItem,
} from "./model";

function item(patch: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: "test-item",
    itemCode: "SAMPLE-001",
    productName: "샘플 타월",
    optionName: "화이트",
    quantity: 10,
    unitPrice: 5000,
    ...patch,
  };
}

function doc(patch: Partial<QuoteDocument> = {}): QuoteDocument {
  return {
    documentNumber: "Q20260916-000001",
    version: 1,
    createdAt: "2026-09-16T00:00:00.000Z",
    recipientCompany: "샘플거래처",
    supplier: {
      companyName: "(주)샘플공급",
      businessNumber: "000-00-00000",
      contactName: "홍샘플",
      contactPhone: "02-0000-0000",
      contactEmail: "sample@example.com",
      address: "서울특별시 샘플구 샘플로 1",
    },
    validUntil: "",
    deliveryTerms: "택배 배송",
    priceCondition: "부가세 별도 금액입니다.",
    notes: "",
    items: [item({ quantity: 10, unitPrice: 5000 }), item({ id: "test-item-2", quantity: 20, unitPrice: 3000 })],
    adjustment: null,
    ...patch,
  };
}

describe("금액 계산", () => {
  it("행 금액은 수량 × 단가", () => {
    expect(lineAmount(item({ quantity: 10, unitPrice: 5000 }))).toBe(50_000);
  });

  it("계획서 검증 사례: 110,000원과 조정 +3,000원 = 113,000원", () => {
    const target = doc({ adjustment: { description: "배송비", amount: 3000 } });
    expect(itemsSubtotal(target.items)).toBe(110_000);
    expect(documentTotal(target)).toBe(113_000);
    expect(validateDocument(target).total).toBe(113_000);
    expect(validateDocument(target).valid).toBe(true);
  });

  it("할인 조정은 총액에서 차감된다", () => {
    const target = doc({ adjustment: { description: "일괄 할인", amount: -10_000 } });
    expect(documentTotal(target)).toBe(100_000);
  });

  it("조정 후 총액이 음수면 무효", () => {
    const target = doc({
      items: [item({ quantity: 1, unitPrice: 1000 })],
      adjustment: { description: "할인", amount: -2000 },
    });
    const result = validateDocument(target);
    expect(result.valid).toBe(false);
    expect(result.documentErrors.some((error) => error.field === "total")).toBe(true);
  });
});

describe("입력 검증", () => {
  it("빈 상품명은 행 오류", () => {
    const result = validateDocument(doc({ items: [item({ productName: "   " })] }));
    expect(result.valid).toBe(false);
    expect(result.itemErrors[0]?.productName).toBeTruthy();
  });

  it("0 또는 음수 수량은 오류", () => {
    const zero = validateDocument(doc({ items: [item({ quantity: 0 })] }));
    const negative = validateDocument(doc({ items: [item({ quantity: -3 })] }));
    expect(zero.itemErrors[0]?.quantity).toBeTruthy();
    expect(negative.itemErrors[0]?.quantity).toBeTruthy();
  });

  it("소수·문자열 단가는 오류", () => {
    const result = validateDocument(doc({ items: [item({ unitPrice: 1500.5 })] }));
    expect(result.itemErrors[0]?.unitPrice).toBeTruthy();
  });

  it("허용 범위 초과 수량·단가는 오류", () => {
    const result = validateDocument(
      doc({ items: [item({ quantity: MAX_QUANTITY + 1, unitPrice: MAX_UNIT_PRICE + 1 })] }),
    );
    expect(result.itemErrors[0]?.quantity).toBeTruthy();
    expect(result.itemErrors[0]?.unitPrice).toBeTruthy();
  });

  it("조정 금액에 설명이 없으면 오류", () => {
    const result = validateDocument(doc({ adjustment: { description: "  ", amount: 3000 } }));
    expect(result.valid).toBe(false);
    expect(result.adjustmentError).toBeTruthy();
  });

  it("수신 회사명이 없으면 오류", () => {
    const result = validateDocument(doc({ recipientCompany: "" }));
    expect(result.valid).toBe(false);
    expect(result.documentErrors.some((error) => error.field === "recipientCompany")).toBe(true);
  });

  it("품목이 0행이면 오류", () => {
    const result = validateDocument(doc({ items: [] }));
    expect(result.valid).toBe(false);
  });
});

describe("정수 입력 파싱", () => {
  it("숫자가 아닌 문자를 제거하고 정수로 만든다", () => {
    expect(parseIntegerInput("12,000")).toBe(12000);
    expect(parseIntegerInput("1e5")).toBe(15);
    expect(parseIntegerInput("")).toBe(0);
  });

  it("allowNegative일 때만 음수를 허용한다", () => {
    expect(parseIntegerInput("-3000", true)).toBe(-3000);
    expect(parseIntegerInput("-3000", false)).toBe(3000);
  });
});

describe("표시 도우미", () => {
  it("원 단위로 포맷한다", () => {
    expect(formatKrw(113000)).toBe("113,000원");
  });

  it("다운로드 파일명에 쓸 수 없는 문자를 제거한다", () => {
    expect(sanitizeFileNamePart("Q2026/09:16")).toBe("Q2026-09-16");
    expect(sanitizeFileNamePart("")).toBe("quote");
  });
});
