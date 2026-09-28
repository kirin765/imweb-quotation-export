import * as XLSX from "xlsx";
import {
  adjustmentAmount,
  formatDateTime,
  lineAmount,
  sanitizeFileNamePart,
  type QuoteDocument,
} from "./model";

type CellObject = XLSX.CellObject;

function stringCell(value: string): CellObject {
  return { t: "s", v: value };
}

function numberCell(value: number): CellObject {
  return { t: "n", v: value, z: "#,##0" };
}

function labelCell(value: string): CellObject {
  return { t: "s", v: value, s: { font: { bold: true } } };
}

const COLUMNS = [
  { wch: 6 },
  { wch: 14 },
  { wch: 32 },
  { wch: 18 },
  { wch: 10 },
  { wch: 14 },
  { wch: 16 },
];

const NO_RECALC_NOTICE =
  "이 파일은 편집할 수 있지만 수량·단가를 수정해도 합계가 자동 재계산되지 않습니다. 재계산이 필요하면 앱에서 수정한 뒤 다시 내보내세요.";
const NO_SYNC_NOTICE =
  "앱 밖에서 수정한 파일과 이미 내보낸 PDF는 자동으로 동기화되지 않습니다. 위 문서번호·버전·작성시각으로 짝을 확인하세요.";

export function documentToSheet(doc: QuoteDocument): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const set = (row: number, col: number, cell: CellObject | null) => {
    if (!cell) {
      return;
    }
    ws[XLSX.utils.encode_cell({ r: row, c: col })] = cell;
  };

  let row = 0;
  set(row, 0, stringCell("견적서"));
  row += 2;

  set(row, 0, labelCell("문서번호"));
  set(row, 1, stringCell(doc.documentNumber));
  set(row, 3, labelCell("버전"));
  set(row, 4, stringCell(`v${doc.version}`));
  row += 1;

  set(row, 0, labelCell("작성일시"));
  set(row, 1, stringCell(formatDateTime(doc.createdAt)));
  set(row, 3, labelCell("유효기한"));
  set(row, 4, stringCell(doc.validUntil.trim() === "" ? "-" : doc.validUntil));
  row += 1;

  set(row, 0, labelCell("수신처"));
  set(row, 1, stringCell(doc.recipientCompany));
  set(row, 3, labelCell("공급자"));
  set(row, 4, stringCell(doc.supplier.companyName));
  row += 1;

  set(row, 0, labelCell("납기·배송 조건"));
  set(row, 1, stringCell(doc.deliveryTerms.trim() === "" ? "-" : doc.deliveryTerms));
  set(row, 3, labelCell("가격 조건"));
  set(row, 4, stringCell(doc.priceCondition.trim() === "" ? "-" : doc.priceCondition));
  row += 2;

  const headerRow = row;
  ["순번", "품목 코드", "상품명", "옵션", "수량", "단가", "금액"].forEach((title, col) => {
    set(headerRow, col, labelCell(title));
  });
  row += 1;

  doc.items.forEach((item, index) => {
    set(row, 0, numberCell(index + 1));
    set(row, 1, stringCell(item.itemCode));
    set(row, 2, stringCell(item.productName));
    set(row, 3, stringCell(item.optionName));
    set(row, 4, numberCell(item.quantity));
    set(row, 5, numberCell(item.unitPrice));
    set(row, 6, numberCell(lineAmount(item)));
    row += 1;
  });

  const subtotal = doc.items.reduce((sum, item) => sum + lineAmount(item), 0);
  set(row, 3, labelCell("상품 합계"));
  set(row, 6, numberCell(subtotal));
  row += 1;

  if (doc.adjustment) {
    set(row, 3, labelCell(`조정 · ${doc.adjustment.description}`));
    set(row, 6, numberCell(doc.adjustment.amount));
    row += 1;
  }

  set(row, 3, labelCell("견적 총액"));
  set(row, 6, numberCell(subtotal + adjustmentAmount(doc.adjustment)));
  row += 2;

  if (doc.notes.trim() !== "") {
    set(row, 0, labelCell("비고"));
    set(row, 1, stringCell(doc.notes));
    row += 1;
  }

  set(row, 0, labelCell("안내"));
  set(row, 1, stringCell(NO_RECALC_NOTICE));
  row += 1;
  set(row, 1, stringCell(NO_SYNC_NOTICE));
  row += 1;
  set(row, 1, stringCell("이 문서는 주문 전 제안이며 결제 완료 또는 주문 생성을 의미하지 않습니다."));
  row += 1;
  if (doc.supplier.businessNumber.trim() !== "" || doc.supplier.contactName.trim() !== "") {
    const contact = [
      doc.supplier.businessNumber.trim() === "" ? null : `사업자번호 ${doc.supplier.businessNumber}`,
      doc.supplier.contactName.trim() === "" ? null : `담당 ${doc.supplier.contactName}`,
      doc.supplier.contactPhone.trim() === "" ? null : `연락처 ${doc.supplier.contactPhone}`,
      doc.supplier.contactEmail.trim() === "" ? null : `이메일 ${doc.supplier.contactEmail}`,
    ]
      .filter((value): value is string => value !== null)
      .join(" · ");
    set(row, 1, stringCell(contact));
    row += 1;
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 6 } });
  ws["!cols"] = COLUMNS;
  return ws;
}

export function documentToXlsx(doc: QuoteDocument): Uint8Array<ArrayBuffer> {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `견적서 ${doc.documentNumber} v${doc.version}`,
    Subject: `${doc.recipientCompany} 견적서`,
    CreatedDate: new Date(doc.createdAt),
  };
  XLSX.utils.book_append_sheet(workbook, documentToSheet(doc), "견적서");
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Uint8Array(output);
}

export function xlsxFileName(doc: QuoteDocument): string {
  return `견적서_${sanitizeFileNamePart(doc.documentNumber)}_v${doc.version}.xlsx`;
}
