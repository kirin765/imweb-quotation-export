import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { documentToSheet, documentToXlsx, xlsxFileName } from "./xlsx";
import type { QuoteDocument, QuoteItem } from "./model";

function item(patch: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: "row-1",
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
    version: 2,
    createdAt: "2026-09-16T01:00:00.000Z",
    recipientCompany: "샘플거래처",
    supplier: {
      companyName: "(주)샘플공급",
      businessNumber: "000-00-00000",
      contactName: "홍샘플",
      contactPhone: "02-0000-0000",
      contactEmail: "sample@example.com",
      address: "서울특별시 샘플구 샘플로 1",
    },
    validUntil: "2026-10-31",
    deliveryTerms: "택배 배송",
    priceCondition: "부가세 별도 금액입니다.",
    notes: "메모",
    items: [item(), item({ id: "row-2", itemCode: "SAMPLE-002", productName: "샘플 컵", optionName: "300ml", quantity: 20, unitPrice: 3000 })],
    adjustment: null,
    ...patch,
  };
}

function cellsOfType(ws: XLSX.WorkSheet, expected: "s" | "n"): XLSX.CellObject[] {
  return Object.keys(ws)
    .filter((key) => !key.startsWith("!"))
    .map((key) => ws[key] as XLSX.CellObject)
    .filter((cell) => cell && cell.t === expected);
}

describe("XLSX 내보내기", () => {
  it("합계를 숫자 셀로 내보내 110,000 / 113,000원을 만든다", () => {
    const ws = documentToSheet(doc({ adjustment: { description: "배송비", amount: 3000 } }));
    const numericValues = cellsOfType(ws, "n")
      .map((cell) => cell.v as number)
      .filter((value) => value >= 1000);
    expect(numericValues).toContain(50_000);
    expect(numericValues).toContain(60_000);
    expect(numericValues).toContain(110_000);
    expect(numericValues).toContain(113_000);
  });

  it("수식처럼 보이는 상품명도 문자열 셀로만 기록하고 수식을 만들지 않는다", () => {
    const dangerous = ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "=HYPERLINK(\"http://x\")"];
    const ws = documentToSheet(
      doc({ items: dangerous.map((name, index) => item({ id: `d-${index}`, productName: name })) }),
    );
    const textValues = cellsOfType(ws, "s").map((cell) => cell.v as string);
    dangerous.forEach((name) => {
      expect(textValues).toContain(name);
    });
    const anyFormula = Object.keys(ws)
      .filter((key) => !key.startsWith("!"))
      .map((key) => ws[key] as XLSX.CellObject)
      .some((cell) => cell && (cell.f !== undefined || cell.t === "e"));
    expect(anyFormula).toBe(false);
  });

  it("문서 번호·버전·작성시각과 내보내기 주의 문구를 담는다", () => {
    const ws = documentToSheet(doc());
    const textValues = cellsOfType(ws, "s").map((cell) => cell.v as string);
    expect(textValues).toContain("Q20260916-000001");
    expect(textValues).toContain("v2");
    expect(textValues.join(" ")).toContain("자동 재계산되지 않습니다");
  });

  it("실제 파일 바이트를 생성하고 다시 읽을 수 있다", () => {
    const bytes = documentToXlsx(doc());
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames).toContain("견적서");
    const sheet = workbook.Sheets["견적서"];
    const flat = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: true });
    const values = flat.flat().map((value) => String(value));
    expect(values).toContain("샘플 타월");
    expect(values).toContain("110000");
  });

  it("내보내기 파일명을 문서번호·버전으로 만들고 위험 문자를 제거한다", () => {
    const name = xlsxFileName(doc({ documentNumber: "Q/2026:001", version: 3 }));
    expect(name).toBe("견적서_Q-2026-001_v3.xlsx");
  });
});
