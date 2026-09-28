import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv, parseItemCsv } from "./csv";
import { MAX_CSV_ROWS } from "./model";

const HEADER = "item_code,product_name,option_name,quantity,unit_price";

describe("CSV 파서", () => {
  it("BOM과 CRLF를 처리한다", () => {
    const rows = parseCsv(`\uFEFF${HEADER}\r\nA,상품,옵션,1,1000\r\n`);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe("item_code");
    expect(rows[1][2]).toBe("옵션");
  });

  it("인용부호 안의 쉼표와 개행을 보존한다", () => {
    const rows = parseCsv(
      `${HEADER}\n"A-1","이름, 쉼표",\"따옴표\"\"포함\",2,"3000"\n"A-2","여러\n줄",옵션,3,4000\n`,
    );
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("이름, 쉼표");
    expect(rows[1][2]).toBe('따옴표"포함');
    expect(rows[2][1]).toBe("여러\n줄");
  });
});

describe("CSV 인코딩 감지", () => {
  // 엑셀의 'CSV(쉼표로 분리)'로 저장하면 EUC-KR이 된다(실측 바이트).
  const eucKrBytes = new Uint8Array([
    0xbb, 0xf3, 0xc7, 0xb0, 0xb8, 0xed, 0x2c, 0xbc, 0xf6, 0xb7, 0xae, 0x2c, 0xc6, 0xc7, 0xb8, 0xc5,
    0xb0, 0xa1, 0x0a, 0xbb, 0xf9, 0xc7, 0xc3, 0x20, 0xc5, 0xb8, 0xbf, 0xf9, 0x2c, 0x31, 0x30, 0x2c,
    0x35, 0x30, 0x30, 0x30, 0x0a,
  ]);

  it("UTF-8 파일은 그대로 읽는다", () => {
    const bytes = new TextEncoder().encode("상품명,수량,판매가\n샘플 타월,10,5000\n")
      .buffer as ArrayBuffer;
    const decoded = decodeCsvBytes(bytes);
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toContain("샘플 타월");
  });

  it("EUC-KR 파일도 글자가 깨지지 않게 읽는다", () => {
    const decoded = decodeCsvBytes(eucKrBytes.buffer as ArrayBuffer);
    expect(decoded.encoding).toBe("euc-kr");
    expect(decoded.text).toContain("상품명");
    const result = parseItemCsv(decoded.text);
    expect(result.headerError).toBeNull();
    expect(result.items[0]).toMatchObject({ productName: "샘플 타월", quantity: 10, unitPrice: 5000 });
  });
});

describe("품목 CSV 가져오기", () => {
  it("정상 행을 숫자로 변환한다", () => {
    const result = parseItemCsv(`${HEADER}\nSAMPLE-001,샘플 타월,화이트,10,5000\n`);
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemCode: "SAMPLE-001",
      productName: "샘플 타월",
      quantity: 10,
      unitPrice: 5000,
    });
  });

  it("품목 코드 앞자리 0을 문자열로 보존한다", () => {
    const result = parseItemCsv(`${HEADER}\n000123,상품,옵션,1,1000\n`);
    expect(result.items[0].itemCode).toBe("000123");
  });

  it("단가·금액 열이 없으면 아무 행도 가져오지 않는다", () => {
    const result = parseItemCsv(`item_code,product_name,option_name\nA,상품,옵션\n`);
    expect(result.headerError).toMatch(/필수 열이 없습니다: unit_price/);
    expect(result.items).toHaveLength(0);
  });

  it("같은 뜻의 열이 중복되면 앞의 열을 쓰고 경고한다", () => {
    const result = parseItemCsv(`product_name,product_name,quantity,unit_price\n가,나,1,1000\n`);
    expect(result.headerError).toBeNull();
    expect(result.items[0].productName).toBe("가");
    expect(result.warnings.join(" ")).toContain("일부만 사용");
  });

  it("재고수량 열은 수량으로 쓰지 않고 경고한다(마켓 상품 목록 양식)", () => {
    const result = parseItemCsv(`상품명,판매가,재고수량\n샘플 타월,5000,120\n`);
    expect(result.headerError).toBeNull();
    expect(result.items[0]).toMatchObject({ quantity: 1, unitPrice: 5000 });
    const warnings = result.warnings.join(" ");
    expect(warnings).toContain("재고수량");
    expect(warnings).toContain("재고는 주문 수량이 아니므로");
  });

  it("수량 열이 없으면 1로 채우고 경고한다(상품 목록 내보내기 양식)", () => {
    const result = parseItemCsv(`상품코드,상품명,판매가\nP0000101,샘플 타월,5000\n`);
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items[0]).toMatchObject({ quantity: 1, unitPrice: 5000 });
    expect(result.warnings.join(" ")).toContain("수량을 1로");
  });

  it("행별 오류를 줄 번호와 함께 모으고 유효 행만 통과시킨다", () => {
    const csv = [
      HEADER,
      "A-1,정상,옵션,10,5000",
      "A-2,,옵션,2,3000",
      "A-3,수량오류,옵션,0,3000",
      "A-4,단가오류,옵션,2,3.5",
      "A-5,쉼표,옵션,2,1000,extra",
    ].join("\n");
    const result = parseItemCsv(csv);
    expect(result.headerError).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].productName).toBe("정상");
    expect(result.errors.map((error) => error.line)).toEqual([3, 4, 5, 6]);
    expect(result.errors.every((error) => error.message.length > 0)).toBe(true);
  });

  it("데이터 행이 상한을 넘으면 거부한다", () => {
    const rows = [HEADER];
    for (let i = 0; i < MAX_CSV_ROWS + 1; i += 1) {
      rows.push(`A-${i},상품,옵션,1,1000`);
    }
    const result = parseItemCsv(rows.join("\n"));
    expect(result.headerError).toContain(`${MAX_CSV_ROWS}행`);
    expect(result.items).toHaveLength(0);
  });

  it("상품 목록 내보내기 양식(상품코드·상품명·공급가·판매가·옵션)을 읽는다", () => {
    const result = parseItemCsv(`상품코드,상품명,공급가,판매가,옵션,진열상태
P0000101,샘플 타월,3500.00,5000.00,화이트,T
P0000101,샘플 타월,3500.00,5000.00,네이비,T`);
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      itemCode: "P0000101",
      productName: "샘플 타월",
      optionName: "화이트",
      quantity: 1,
      unitPrice: 5000,
    });
  });

  it("일반 견적서 양식(품목·규격·수량·단가·공급가액·세액)을 읽고 세액은 무시한다", () => {
    const result = parseItemCsv(`품목,규격,수량,단가,공급가액,세액,비고
샘플 타월,화이트,10,5000,50000,5000,`);
    expect(result.headerError).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productName: "샘플 타월",
      optionName: "화이트",
      quantity: 10,
      unitPrice: 5000,
    });
  });

  it("단가 열이 없으면 금액 ÷ 수량으로 단가를 계산하고 경고를 남긴다", () => {
    const result = parseItemCsv(`품명,규격,수량,공급가액
샘플 타월,화이트,10,50000`);
    expect(result.headerError).toBeNull();
    expect(result.items[0].unitPrice).toBe(5000);
    expect(result.warnings.join(" ")).toContain("금액 ÷ 수량");
  });

  it("금액이 수량으로 나누어떨어지지 않으면 조용히 반올림하지 않고 행 오류로 막는다", () => {
    const result = parseItemCsv(`품명,규격,수량,공급가액
샘플 타월,화이트,3,10000`);
    expect(result.items).toHaveLength(0);
    expect(result.errors[0]?.column).toBe("line_amount");
    expect(result.errors[0]?.message).toContain("나누어떨어지지");
  });

  it("같은 뜻의 열이 여럿이면 앞의 열을 쓰고 경고로 알린다", () => {
    const result = parseItemCsv(`상품명,품명,수량,단가
샘플 타월,무시됨,2,1000`);
    expect(result.headerError).toBeNull();
    expect(result.items[0].productName).toBe("샘플 타월");
    expect(result.warnings.join(" ")).toContain("일부만 사용");
  });

  it("소수점 표기(5000.00)와 천단위 쉼표(5,000)를 읽는다", () => {
    const result = parseItemCsv(`상품명,수량,판매가\n샘플 타월,10,5000.00\n샘플 컵,"1,200",3000.00\n`);
    expect(result.headerError).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.items[0]).toMatchObject({ quantity: 10, unitPrice: 5000 });
    expect(result.items[1]).toMatchObject({ quantity: 1200, unitPrice: 3000 });
  });

  it("소수 부분이 0이 아니면 조용히 반올림하지 않고 거부한다", () => {
    const result = parseItemCsv(`상품명,수량,판매가\n샘플 타월,10,5000.50\n`);
    expect(result.items).toHaveLength(0);
    expect(result.errors[0]?.column).toBe("unit_price");
  });

  it("공급가와 판매가가 함께 있으면 판매가를 쓴다(상품 목록 엑셀)", () => {
    const result = parseItemCsv(`상품코드,상품명,공급가,판매가\nP0000101,샘플 타월,3500.00,5000.00\n`);
    expect(result.headerError).toBeNull();
    expect(result.items[0].unitPrice).toBe(5000);
    expect(result.warnings.join(" ")).toContain('unit_price은 "판매가" 사용');
  });

  it("위쪽 안내 행이 아는 열 이름을 더 많이 담고 있어도 상품명이 없으면 머리글로 보지 않는다", () => {
    const result = parseItemCsv(
      `수량,단가,금액,공급가,재고수량,옵션명,판매가\n` + // 안내 행: 우리가 아는 이름 7개, 상품명 없음
        `상품명,판매가,재고수량\n` + // 진짜 머리글
        `샘플 타월,5000,10\n`,
    );
    expect(result.headerError).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ productName: "샘플 타월", unitPrice: 5000, quantity: 1 });
  });

  it("건너뛴 안내 행 번호를 알려 준다", () => {
    const result = parseItemCsv(
      `상품명,판매가,재고수량\n비필수,필수,필수\n샘플 타월,5000,10\n`,
    );
    expect(result.items).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("(2행)");
  });

  it("옵션 칸에 여러 값이 있으면 정리를 안내한다(마켓 조합형)", () => {
    const result = parseItemCsv(`상품명,판매가,옵션값\n샘플 골지 니트,85000,"빨강,노랑\nS,M,L"\n`);
    expect(result.items[0].optionName).toContain("빨강");
    expect(result.warnings.join(" ")).toContain("조합형");
    expect(result.warnings.join(" ")).toContain("옵션가");
  });

  it("빈 파일과 헤더만 있는 파일을 구분한다", () => {
    expect(parseItemCsv("").headerError).toBeTruthy();
    const headerOnly = parseItemCsv(`${HEADER}\n`);
    expect(headerOnly.headerError).toBeNull();
    expect(headerOnly.items).toHaveLength(0);
    expect(headerOnly.dataRowCount).toBe(0);
  });
});
