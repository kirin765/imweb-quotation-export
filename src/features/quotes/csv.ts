import {
  MAX_CODE_LENGTH,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  MAX_NAME_LENGTH,
  MAX_QUANTITY,
  MAX_UNIT_PRICE,
  newId,
  type QuoteItem,
} from "./model";

export const CSV_COLUMNS = [
  "item_code",
  "product_name",
  "option_name",
  "quantity",
  "unit_price",
] as const;

const REQUIRED_COLUMNS = ["product_name", "quantity", "unit_price"] as const;

/**
 * 실제 운영자가 가진 파일의 열 이름을 받아들인다.
 * - 쇼핑몰 상품 목록 '엑셀 다운로드' 양식(상품코드·상품명·공급가·판매가 등)
 * - 일반 견적서 양식(품목·규격·수량·단가·공급가액·세액)
 * 같은 열이 여러 개면 먼저 나온 열을 쓰고 나머지는 경고로 알린다(조용히 버리지 않는다).
 */
const HEADER_ALIASES: Record<string, string> = {
  상품코드: "item_code",
  상품번호: "item_code",
  품목코드: "item_code",
  자체상품코드: "item_code",
  판매자상품코드: "item_code",
  자체품목코드: "item_code",
  코드: "item_code",
  상품명: "product_name",
  품명: "product_name",
  품목: "product_name",
  품목명: "product_name",
  상품: "product_name",
  제품명: "product_name",
  옵션: "option_name",
  옵션명: "option_name",
  규격: "option_name",
  옵션값: "option_name",
  수량: "quantity",
  주문수량: "quantity",
  단가: "unit_price",
  공급가: "unit_price",
  판매가: "unit_price",
  공급단가: "unit_price",
  판매단가: "unit_price",
  기준단가: "unit_price",
  금액: "line_amount",
  공급가액: "line_amount",
  합계: "line_amount",
  품목금액: "line_amount",
};

/**
 * 한국에서 만든 CSV는 인코딩이 갈린다. 엑셀의 'CSV(쉼표로 분리)'는 EUC-KR(=CP949)이고,
 * 쇼핑몰 다운로드와 엑셀의 'CSV UTF-8'은 UTF-8(BOM 포함)이다.
 * UTF-8로 엄격하게 읽어 보고 실패하면 EUC-KR로 다시 읽는다. 깨진 글자를 그대로 받아들이면
 * 상품명이 물음표로 저장되므로, 조용히 넘어가지 않고 어떤 인코딩으로 읽었는지 알린다.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): {
  text: string;
  encoding: "utf-8" | "euc-kr";
} {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("euc-kr").decode(bytes), encoding: "euc-kr" };
  }
}

/**
 * 실제 파일의 숫자 표기를 받아들인다. 상품 목록 엑셀은 `5000.00`처럼 소수점 둘째 자리까지
 * 내보내고, 사람이 손댄 파일에는 `5,000`처럼 천단위 쉼표가 들어간다. 소수 부분이 0이 아니면
 * 조용히 반올림하지 않고 거부한다.
 */
function parseIntegerCell(raw: string): number | null {
  const trimmed = raw.trim().replace(/[\s,]/g, "");
  if (trimmed === "") {
    return null;
  }
  const match = /^(\d+)(?:\.(0+))?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) ? value : null;
}

const normalizeColumn = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_\-()]/g, "");

/**
 * 같은 뜻의 열이 여럿이면 이 순서로 고른다. 상품 목록 엑셀에는 공급가(원가 성격)와
 * 판매가가 함께 나오는데, 거래처에 보내는 견적의 출발점은 판매가가 맞다.
 */
const COLUMN_PREFERENCE: Record<string, string[]> = {
  item_code: ["상품코드", "판매자상품코드", "자체상품코드", "품목코드", "자체품목코드", "상품번호", "코드"],
  product_name: ["상품명", "품목명", "품명", "품목", "제품명"],
  option_name: ["옵션값", "옵션명", "옵션", "규격"],
  quantity: ["수량", "주문수량"],
  unit_price: ["판매가", "판매단가", "단가", "기준단가", "공급가", "공급단가"],
  line_amount: ["공급가액", "금액", "품목금액", "합계"],
};

const CANONICAL_BY_NORMALIZED = new Map(
  CSV_COLUMNS.map((column) => [normalizeColumn(column), column] as const),
);

function resolveColumn(header: string): string | null {
  const normalized = normalizeColumn(header);
  if (normalized === "") {
    return null;
  }
  return CANONICAL_BY_NORMALIZED.get(normalized) ?? HEADER_ALIASES[normalized] ?? null;
}

const GUIDE_ROW_HINTS = /(입력|필수|선택하여|비필수)/;
const GUIDE_ROW_MARKERS = new Set(["필수", "비필수", "조건부필수"]);

function countRecognized(cells: readonly string[]): number {
  return cells.reduce((sum, cell) => sum + (resolveColumn(cell) ? 1 : 0), 0);
}

/**
 * 열 이름 행을 찾는다. 상품 목록 엑셀은 첫 행이 머리글이지만, 마켓 양식은 위에 제목 행이
 * 붙기도 한다. 상품명 열이 있는 행만 후보로 보고, 그중 아는 열 이름이 가장 많은 행을 머리글로
 * 삼는다. 상품명 없는 행을 후보에서 빼지 않으면, 열 이름을 나열한 안내 행이 후보로 뽑혀
 * 멀쩡한 파일을 거부할 수 있다.
 */
function findHeaderRow(rows: readonly string[][]): number {
  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const row = rows[index];
    if (!row.some((cell) => resolveColumn(cell) === "product_name")) {
      continue;
    }
    const score = countRecognized(row);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : -1;
}

/**
 * '필수/비필수' 안내 행이나 '…입력할 수 있습니다' 설명 행인지.
 * 실제 상품 행을 지우지 않도록 촘촘하게(2개 이상 표시 또는 3개 이상 안내 문구) 본다.
 */
function isGuideRow(cells: readonly string[]): boolean {
  if (cells.filter((cell) => GUIDE_ROW_MARKERS.has(cell.trim())).length >= 2) {
    return true;
  }
  return cells.filter((cell) => GUIDE_ROW_HINTS.test(cell)).length >= 3;
}

export type CsvCellError = {
  line: number;
  column: string;
  message: string;
};

export type CsvParseResult = {
  headerError: string | null;
  items: QuoteItem[];
  errors: CsvCellError[];
  /** 가져오기는 하되 사용자가 알아야 하는 사실(단가 환산, 중복 열 무시 등). */
  warnings: string[];
  dataRowCount: number;
};

export const CSV_TEMPLATE = `item_code,product_name,option_name,quantity,unit_price
SAMPLE-001,샘플 타월,화이트,10,5000
SAMPLE-002,샘플 컵,300ml,20,3000
`;

/**
 * RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside
 * quotes, CRLF/LF line endings, leading BOM and trailing empty lines.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    const isBlank = row.every((cell) => cell.trim() === "");
    if (!isBlank) {
      rows.push(row);
    }
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }

    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }

    if (char === "\r") {
      if (input[index + 1] === "\n") {
        pushRow();
        index += 2;
        continue;
      }
      pushRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}

export function csvByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

export function parseItemCsv(text: string): CsvParseResult {
  const errors: CsvCellError[] = [];
  const items: QuoteItem[] = [];

  if (csvByteLength(text) > MAX_CSV_BYTES) {
    return {
      headerError: `CSV 파일은 ${Math.round(MAX_CSV_BYTES / 1024)}KB 이하여야 합니다.`,
      items: [],
      errors,
      warnings: [],
      dataRowCount: 0,
    };
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    return {
      headerError: "CSV 파일이 비어 있습니다.",
      items: [],
      errors,
      warnings: [],
      dataRowCount: 0,
    };
  }

  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) {
    return {
      headerError:
        "열 이름 행을 찾지 못했습니다. 앞 10행 안에 상품명·단가(또는 금액) 같은 열 이름이 있어야 합니다. 양식 맨 위의 안내 행을 지우고 다시 올려 주세요.",
      items: [],
      errors,
      warnings: [],
      dataRowCount: 0,
    };
  }

  const header = rows[headerRowIndex].map(normalizeHeader);
  const candidates = new Map<string, { index: number; raw: string; rank: number }[]>();
  const warnings: string[] = [];
  if (headerRowIndex > 0) {
    warnings.push(
      `위 ${headerRowIndex}행은 제목·안내라 건너뛰고 ${headerRowIndex + 1}번째 행을 열 이름으로 읽었습니다.`,
    );
  }

  header.forEach((raw, index) => {
    const column = resolveColumn(raw);
    if (!column) {
      return;
    }
    const preference = COLUMN_PREFERENCE[column] ?? [];
    const normalized = normalizeColumn(raw);
    const rank = preference.indexOf(normalized);
    const list = candidates.get(column) ?? [];
    list.push({ index, raw, rank: rank === -1 ? Number.MAX_SAFE_INTEGER : rank });
    candidates.set(column, list);
  });

  const columnIndex = new Map<string, number>();
  const ignored: string[] = [];
  for (const [column, list] of candidates) {
    const [chosen, ...rest] = [...list].sort((a, b) => a.rank - b.rank || a.index - b.index);
    columnIndex.set(column, chosen.index);
    for (const item of rest) {
      ignored.push(`"${item.raw}" (${column}은 "${chosen.raw}" 사용)`);
    }
  }

  const hasUnitPrice = columnIndex.has("unit_price");
  const hasLineAmount = columnIndex.has("line_amount");
  const hasQuantity = columnIndex.has("quantity");
  const missing = REQUIRED_COLUMNS.filter(
    (column) =>
      column === "product_name"
        ? !columnIndex.has("product_name")
        : column === "quantity"
          ? false
          : !hasUnitPrice && !hasLineAmount,
  );
  if (missing.length > 0) {
    return {
      headerError: `필수 열이 없습니다: ${missing.join(
        ", ",
      )}. 쓸 수 있는 이름: ${CSV_COLUMNS.join(", ")} 또는 상품명·품명·품목 / 수량 / 단가·공급가·판매가, 금액·공급가액`,
      items: [],
      errors,
      warnings,
      dataRowCount: 0,
    };
  }

  if (!hasUnitPrice && hasLineAmount) {
    warnings.push("단가 열이 없어 금액 ÷ 수량으로 단가를 계산했습니다.");
  }
  if (!hasQuantity) {
    warnings.push("수량 열이 없어 모든 행의 수량을 1로 채웠습니다. 표에서 수정하세요.");
  }
  // 재고수량은 '지금 있는 개수'지 주문 수량이 아니다. 수량으로 쓰면 견적이 조용히 틀어진다.
  const stockColumns = header.filter((column) => normalizeColumn(column).includes("재고"));
  if (!hasQuantity && stockColumns.length > 0) {
    warnings.push(
      `재고수량 열(${stockColumns.map((c) => `"${c}"`).join(", ")})은 견적 수량으로 쓰지 않습니다. 재고는 주문 수량이 아니므로 표에서 직접 입력하세요.`,
    );
  }
  if (ignored.length > 0) {
    warnings.push(`같은 뜻의 열이 여럿이라 일부만 사용했습니다: ${ignored.join(", ")}`);
  }

  const dataRows: { cells: string[]; line: number }[] = [];
  const guideLines: number[] = [];
  rows.slice(headerRowIndex + 1).forEach((cells, offset) => {
    const line = headerRowIndex + offset + 2;
    if (isGuideRow(cells)) {
      guideLines.push(line);
      return;
    }
    dataRows.push({ cells, line });
  });
  if (guideLines.length > 0) {
    // 어떤 줄을 건너뛰었는지 밝힌다. 실제 상품 행이 안내 행으로 잘못 분류되면 바로 알아챌 수 있다.
    warnings.push(
      `필수·설명 안내 행 ${guideLines.length}개(${guideLines.join(", ")}행)는 상품이 아니라서 건너뛰었습니다.`,
    );
  }
  if (dataRows.length > MAX_CSV_ROWS) {
    return {
      headerError: `CSV 데이터는 ${MAX_CSV_ROWS}행 이하여야 합니다. (현재 ${dataRows.length}행)`,
      items: [],
      errors,
      warnings,
      dataRowCount: dataRows.length,
    };
  }

  dataRows.forEach(({ cells, line }) => {
    const value = (column: string): string => {
      const position = columnIndex.get(column);
      if (position === undefined) {
        return "";
      }
      return (cells[position] ?? "").trim();
    };

    if (cells.length > header.length) {
      errors.push({
        line,
        column: "-",
        message: `열 개수가 헤더(${header.length}개)보다 많습니다. 쉼표가 인용부호 없이 들어갔는지 확인하세요.`,
      });
      return;
    }

    const productName = value("product_name");
    const itemCode = value("item_code");
    const optionName = value("option_name");
    const quantityRaw = hasQuantity ? value("quantity") : "1";
    const unitPriceRaw = value("unit_price");

    let rowHasError = false;
    const pushError = (column: string, message: string) => {
      rowHasError = true;
      errors.push({ line, column, message });
    };

    if (productName === "") {
      pushError("product_name", "상품명이 비어 있습니다.");
    } else if (productName.length > MAX_NAME_LENGTH) {
      pushError("product_name", `상품명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`);
    }

    if (itemCode.length > MAX_CODE_LENGTH) {
      pushError("item_code", `품목 코드는 ${MAX_CODE_LENGTH}자 이하여야 합니다.`);
    }

    if (optionName.length > MAX_NAME_LENGTH) {
      pushError("option_name", `옵션명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`);
    }

    const parsedQuantity = parseIntegerCell(quantityRaw);
    let quantity = 0;
    if (parsedQuantity === null) {
      pushError("quantity", "수량은 1 이상의 정수여야 합니다. (5,000·5000.00 형식은 허용)");
    } else {
      quantity = parsedQuantity;
      if (quantity < 1) {
        pushError("quantity", "수량은 1 이상이어야 합니다.");
      } else if (quantity > MAX_QUANTITY) {
        pushError("quantity", `수량은 ${MAX_QUANTITY.toLocaleString("ko-KR")} 이하여야 합니다.`);
      }
    }

    let unitPrice = 0;
    if (!hasUnitPrice) {
      // 금액 열만 있는 견적서 양식: 수량으로 나누어떨어질 때만 단가로 환산한다(조용한 반올림 금지).
      const amount = parseIntegerCell(value("line_amount"));
      if (amount === null) {
        pushError("line_amount", "금액은 0 이상의 정수(원)여야 합니다.");
      } else if (quantity > 0) {
        if (amount % quantity !== 0) {
          pushError(
            "line_amount",
            `금액 ${amount}원이 수량 ${quantity}로 나누어떨어지지 않아 단가를 계산할 수 없습니다. 단가 열을 넣어 주세요.`,
          );
        } else {
          unitPrice = amount / quantity;
          if (unitPrice > MAX_UNIT_PRICE) {
            pushError(
              "unit_price",
              `계산한 단가가 ${MAX_UNIT_PRICE.toLocaleString("ko-KR")}원을 넘습니다.`,
            );
          }
        }
      }
    } else {
      const parsedPrice = parseIntegerCell(unitPriceRaw);
      if (parsedPrice === null) {
        pushError("unit_price", "단가는 0 이상의 정수(원)여야 합니다. (5,000·5000.00 형식은 허용)");
      } else {
        unitPrice = parsedPrice;
        if (unitPrice > MAX_UNIT_PRICE) {
          pushError(
            "unit_price",
            `단가는 ${MAX_UNIT_PRICE.toLocaleString("ko-KR")}원 이하여야 합니다.`,
          );
        }
      }
    }

    if (rowHasError) {
      return;
    }

    items.push({
      id: newId(),
      itemCode,
      productName,
      optionName,
      quantity,
      unitPrice,
    });
  });

  const multiOptionRows = items.filter((item) => /[,\n]/.test(item.optionName)).length;
  if (multiOptionRows > 0) {
    warnings.push(
      `옵션 칸에 여러 값이 함께 든 행이 ${multiOptionRows}개 있습니다(마켓 양식의 조합형). 한 행을 한 상품으로 가져오므로 필요한 옵션만 남기고 정리하세요. 옵션 추가금액(옵션가)은 반영하지 않았습니다.`,
    );
  }

  return {
    headerError: null,
    items,
    errors,
    warnings,
    dataRowCount: dataRows.length,
  };
}
