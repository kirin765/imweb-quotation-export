import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  columnIndexFromRef,
  decodeXmlText,
  isOleFile,
  isZipFile,
  parseSharedStrings,
  parseSheetRows,
  readXlsxRows,
  rowsToCsv,
  XlsxReadError,
} from "./xlsx-read";

describe("엑셀(.xlsx) 읽기", () => {
  it("열 참조를 0부터 세는 인덱스로 바꾼다", () => {
    expect(columnIndexFromRef("A1")).toBe(0);
    expect(columnIndexFromRef("B3")).toBe(1);
    expect(columnIndexFromRef("Z9")).toBe(25);
    expect(columnIndexFromRef("AA1")).toBe(26);
    expect(columnIndexFromRef("AB2")).toBe(27);
  });

  it("XML 엔티티와 문자 참조를 되돌린다", () => {
    expect(decodeXmlText("A&amp;B")).toBe("A&B");
    expect(decodeXmlText("&lt;태그&gt;")).toBe("<태그>");
    expect(decodeXmlText("&#x1F600;")).toBe("😀");
    expect(decodeXmlText("&unknown;")).toBe("&unknown;");
  });

  it("공유 문자열에서 조각난 텍스트와 엔티티를 합친다", () => {
    const xml = `<sst><si><t>상품명</t></si><si><r><t>샘플</t></r><r><t xml:space="preserve"> 타월</t></r></si><si><t>빨강 &amp; 파랑</t></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["상품명", "샘플 타월", "빨강 & 파랑"]);
  });

  it("셀 종류(공유문자열·인라인·숫자·불리언·수식결과)를 읽고 빈 셀 자리를 지킨다", () => {
    const xml = `<sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>인라인</t></is></c></row>
      <row r="2"><c r="A2"><v>5000.00</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="str"><f>SUM(A1)</f><v>합계</v></c><c r="D2"/></row>
    </sheetData>`;
    const rows = parseSheetRows(xml, ["첫값"]);
    expect(rows[0]).toEqual(["첫값", "", "인라인"]);
    // 뒤쪽 빈 셀은 정보가 없으므로 잘라낸다(가운데 빈 칸은 위에서 유지됨)
    expect(rows[1]).toEqual(["5000.00", "TRUE", "합계"]);
  });

  it("자체 저장한 xlsx를 되읽는다(쓰기 라이브러리와 왕복 일치)", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["상품명", "판매가", "수량"],
      ["샘플 타월", 5000, 10],
      ["빨강, 파랑 \"세트\"", 3000, 2],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "상품");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

    const result = await readXlsxRows(bytes);

    expect(result.sheetName).toBe("상품");
    expect(result.rows[0]).toEqual(["상품명", "판매가", "수량"]);
    expect(result.rows[1]).toEqual(["샘플 타월", "5000", "10"]);
    expect(result.rows[2]).toEqual(['빨강, 파랑 "세트"', "3000", "2"]);
  });

  it("되읽은 행을 CSV로 바꾸면 기존 가져오기 경로가 그대로 처리한다", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["판매자 상품코드", "상품명", "판매가", "재고수량"],
        ["SS-1", "샘플, 반점", 8500, 120],
      ]),
      "일괄등록",
    );
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

    const csv = rowsToCsv((await readXlsxRows(bytes)).rows);
    const { parseItemCsv } = await import("./csv");
    const parsed = parseItemCsv(csv);

    expect(parsed.headerError).toBeNull();
    expect(parsed.items[0]).toMatchObject({
      itemCode: "SS-1",
      productName: "샘플, 반점",
      quantity: 1,
    });
  });

  it("구형 .xls(바이너리)와 엑셀이 아닌 파일을 구분해 안내한다", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer as ArrayBuffer;
    expect(isOleFile(ole)).toBe(true);
    await expect(readXlsxRows(ole)).rejects.toThrow(/구형 \.xls/);

    const text = new TextEncoder().encode("상품명,판매가\n샘플,5000\n").buffer as ArrayBuffer;
    expect(isZipFile(text)).toBe(false);
    await expect(readXlsxRows(text)).rejects.toThrow(XlsxReadError);
  });

  it("너무 큰 파일은 거부한다", async () => {
    const huge = new ArrayBuffer(5 * 1024 * 1024 + 1);
    new Uint8Array(huge)[0] = 0x50;
    new Uint8Array(huge)[1] = 0x4b;
    await expect(readXlsxRows(huge)).rejects.toThrow(/5MB/);
  });
});
