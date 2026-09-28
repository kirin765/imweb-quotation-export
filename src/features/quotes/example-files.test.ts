import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseItemCsv } from "./csv";

/**
 * 실제 운영자가 가진 파일 형식을 흉내낸 예시(fixtures/examples)가 그대로 들어오는지 확인한다.
 * 실제 파일을 받기 전까지의 대체 검증이며, 받으면 그 파일로 같은 확인을 다시 한다.
 */
const dir = path.resolve(__dirname, "../../../fixtures/examples");
const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8");

describe("실제 형식 예시 파일", () => {
  it("상품 목록 내보내기 양식", () => {
    const result = parseItemCsv(read("product-list-export.csv"));
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.itemCode)).toEqual(["P0000101", "P0000102", "P0000103"]);
    // 소수점 표기(5000.00)를 정수로 읽고, 공급가(3500)가 아니라 판매가(5000)를 쓴다
    expect(result.items[0].unitPrice).toBe(5000);
    expect(result.warnings.join(" ")).toContain('unit_price은 "판매가" 사용');
    expect(result.warnings.join(" ")).toContain("수량을 1로");
  });

  it("일반 견적서 양식", () => {
    const result = parseItemCsv(read("quote-standard.csv"));
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.items[2]).toMatchObject({ productName: "샘플 에코백", quantity: 5, unitPrice: 4200 });
  });

  it("금액만 있는 견적서 양식(단가 환산 + 경고)", () => {
    const result = parseItemCsv(read("quote-amount-only.csv"));
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items.map((item) => item.unitPrice)).toEqual([5000, 3000]);
    expect(result.warnings.join(" ")).toContain("금액 ÷ 수량");
  });

  it("스마트스토어 신 양식(제목 행·필수 안내 행이 섞여 있음)", () => {
    const result = parseItemCsv(read("smartstore-new.csv"));
    expect(result.headerError).toBeNull();
    // 제목 행 1개 + 필수 안내 행 1개 + 설명 행 1개는 상품이 아니다
    expect(result.items).toHaveLength(3);
    expect(result.warnings.join(" ")).toContain("열 이름으로 읽었습니다");
    expect(result.warnings.join(" ")).toContain("안내 행");
    expect(result.items[0]).toMatchObject({
      itemCode: "SSKR_0001",
      productName: "샘플 골지 니트",
      optionName: "베이지",
      quantity: 1,
      unitPrice: 85000,
    });
    expect(result.warnings.join(" ")).toContain("재고는 주문 수량이 아니므로");
  });

  it("스마트스토어 구 양식(첫 행이 열 이름)", () => {
    const result = parseItemCsv(read("smartstore-old.csv"));
    expect(result.headerError).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemCode: "SSKR_0001",
      productName: "샘플 골지 니트",
      quantity: 1,
      unitPrice: 15000,
    });
  });

  it("열 이름 행이 없으면 안내와 함께 거부한다", () => {
    const result = parseItemCsv("안내,안내\n1,2\n");
    expect(result.headerError).toContain("열 이름 행을 찾지 못했습니다");
    expect(result.items).toHaveLength(0);
  });

  it("BOM이 있는 파일", () => {
    const result = parseItemCsv(read("quote-bom.csv"));
    expect(result.headerError).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ productName: "샘플 타월", quantity: 3, unitPrice: 5000 });
  });
});
