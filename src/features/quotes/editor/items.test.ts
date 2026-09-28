import { describe, expect, it } from "vitest";
import { createEmptyItem, type QuoteItem } from "@/features/quotes/model";
import { isBlankItem, mergeImportedItems } from "./items";

const row = (patch: Partial<QuoteItem> = {}): QuoteItem => ({
  id: "x",
  itemCode: "A-1",
  productName: "샘플",
  optionName: "",
  quantity: 1,
  unitPrice: 1000,
  ...patch,
});

describe("가져온 행 합치기", () => {
  it("빈 초안이면 자리표시용 행을 대체한다", () => {
    const result = mergeImportedItems([createEmptyItem()], [row(), row({ id: "y" })]);
    expect(result.items).toHaveLength(2);
    expect(result.replacedBlanks).toBe(true);
    expect(result.items.every((item) => item.productName === "샘플")).toBe(true);
  });

  it("내용이 있는 초안에는 덮어쓰지 않고 뒤에 붙인다", () => {
    const result = mergeImportedItems([row({ id: "keep", productName: "기존 품목" })], [row({ id: "new" })]);
    expect(result.items.map((item) => item.id)).toEqual(["keep", "new"]);
    expect(result.replacedBlanks).toBe(false);
  });

  it("빈 행만 여러 개여도 모두 대체한다", () => {
    const result = mergeImportedItems([createEmptyItem(), createEmptyItem()], [row()]);
    expect(result.items).toHaveLength(1);
    expect(result.replacedBlanks).toBe(true);
  });

  it("빈 행 판정은 상품명·코드·옵션이 모두 비었을 때만", () => {
    expect(isBlankItem(createEmptyItem())).toBe(true);
    expect(isBlankItem(row({ productName: "" }))).toBe(false);
    expect(isBlankItem(row({ itemCode: "" }))).toBe(false);
    expect(isBlankItem(row({ optionName: "화이트" }))).toBe(false);
  });

  it("초안이 비어 있으면 replacedBlanks는 false", () => {
    const result = mergeImportedItems([], [row()]);
    expect(result.replacedBlanks).toBe(false);
    expect(result.items).toHaveLength(1);
  });
});
