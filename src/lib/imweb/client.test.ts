import { describe, expect, it } from "vitest";
import { mapOptionDetails, mapOptionGroups, mapProducts } from "./client";

describe("imweb 상품 adapter", () => {
  it("상품 목록을 정수 금액으로 매핑한다", () => {
    const products = mapProducts([
      {
        prodNo: 101,
        prodCode: "s20240830b4211761ce38c",
        name: "샘플 타월",
        price: 5000,
        priceOrg: 6000,
        priceTax: "Y",
        prodStatus: "sale",
        prodType: "normal",
        unitCode: "u2024012465b0fbe8ce0de",
      },
      { prodNo: "102", name: "샘플 컵", price: "3000.00" },
    ]);
    expect(products[0]).toMatchObject({
      prodNo: 101,
      prodCode: "s20240830b4211761ce38c",
      name: "샘플 타월",
      price: 5000,
      prodStatus: "sale",
    });
    // 문자열로 온 숫자도 받아들인다.
    expect(products[1].prodNo).toBe(102);
    expect(products[1].price).toBe(3000);
  });

  it("옵션 그룹과 값 목록을 매핑한다", () => {
    const groups = mapOptionGroups([
      {
        type: "default",
        optionCode: "O2024092566f3726054a3a",
        name: "색상",
        isRequire: "Y",
        optionValueList: [
          { optionValueCode: "O1", optionValueName: "검정" },
          { optionValueCode: "O2", optionValueName: "흰색" },
        ],
      },
    ]);
    expect(groups[0].name).toBe("색상");
    expect(groups[0].optionValueList.map((v) => v.optionValueName)).toEqual(["검정", "흰색"]);
  });

  it("옵션 상세에서 사람이 읽는 조합 라벨을 만든다", () => {
    const details = mapOptionDetails([
      {
        optionDetailCode: "od1",
        price: 12000,
        priceSupply: 3000,
        stock: 100,
        status: "SALE",
        optionDetailInfoList: [
          { optionCode: "O1", name: "색상", optionValue: { optionValueCode: "V1", optionValueName: "검정" } },
          { optionCode: "O2", name: "사이즈", optionValue: { optionValueCode: "V2", optionValueName: "L" } },
        ],
      },
    ]);
    expect(details[0]).toMatchObject({ optionDetailCode: "od1", price: 12000, stock: 100, status: "SALE" });
    expect(details[0].label).toBe("색상: 검정 / 사이즈: L");
  });

  it("빈 응답에도 안전하다", () => {
    expect(mapProducts(undefined)).toEqual([]);
    expect(mapOptionGroups(null)).toEqual([]);
    expect(mapOptionDetails({})).toEqual([]);
  });
});
