/**
 * .xlsx(OOXML)에서 첫 시트의 값을 읽는다.
 *
 * 왜 직접 읽나: 쓰기에는 SheetJS를 쓰지만 그 라이브러리의 읽기 경로에는 알려진 취약점이 있고
 * npm에는 고친 버전이 없다(npm 0.18.5가 마지막). 고객이 보낸 파일을 그대로 읽는 경로라
 * 필요한 만큼만(첫 시트의 값) 직접 파싱하는 편이 안전하고 번들도 가볍다.
 *
 * 지원: sharedStrings, inlineStr, 수식 캐시값(str), 불리언, 숫자, 셀 건너뜀.
 * 지원하지 않음: 구 .xls(바이너리 BIFF), 날짜 서식(엑셀 일련번호로 들어옴), 여러 시트.
 */

export const MAX_XLSX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_CELLS = 60_000;

export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const ZIP_MAGIC = [0x50, 0x4b];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

export function isOleFile(bytes: ArrayBuffer): boolean {
  return startsWith(new Uint8Array(bytes, 0, 4), OLE_MAGIC);
}

export function isZipFile(bytes: ArrayBuffer): boolean {
  return startsWith(new Uint8Array(bytes, 0, 2), ZIP_MAGIC);
}

type ZipEntry = { method: number; offset: number; compressedSize: number };

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** 중앙 디렉터리를 읽어 엔트리 목록을 만든다. */
function readCentralDirectory(bytes: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(bytes);
  const length = bytes.byteLength;
  const searchFrom = Math.max(0, length - 66_000);
  let eocd = -1;
  for (let offset = length - 22; offset >= searchFrom; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) {
    throw new XlsxReadError("엑셀 파일 형식이 아닙니다(압축 구조를 찾지 못했습니다).");
  }

  const entryCount = readUint16(view, eocd + 10);
  let pointer = readUint32(view, eocd + 16);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder("utf-8");

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, pointer) !== 0x02014b50) {
      break;
    }
    const method = readUint16(view, pointer + 10);
    const compressedSize = readUint32(view, pointer + 20);
    const nameLength = readUint16(view, pointer + 28);
    const extraLength = readUint16(view, pointer + 30);
    const commentLength = readUint16(view, pointer + 32);
    const localOffset = readUint32(view, pointer + 42);
    const name = decoder.decode(new Uint8Array(bytes, pointer + 46, nameLength));

    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    entries.set(name, {
      method,
      offset: localOffset + 30 + localNameLength + localExtraLength,
      compressedSize,
    });

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  if (entries.size === 0) {
    throw new XlsxReadError("엑셀 파일 안에서 시트를 찾지 못했습니다.");
  }
  return entries;
}

async function decompress(data: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) {
    return data;
  }
  if (method !== 8) {
    throw new XlsxReadError(`지원하지 않는 압축 방식입니다(${method}). 엑셀에서 다시 저장해 주세요.`);
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(
  bytes: ArrayBuffer,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) {
    return null;
  }
  const slice = new Uint8Array(bytes, entry.offset, entry.compressedSize);
  return new TextDecoder("utf-8").decode(await decompress(slice, entry.method));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** <si> 하나에 <r><t>가 여러 개일 수 있어 조각을 모두 이어 붙인다. */
function textOf(xml: string): string {
  const parts: string[] = [];
  const pattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    parts.push(decodeXmlText(match[1] ?? ""));
  }
  return parts.join("");
}

export function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const pattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    strings.push(textOf(match[1]));
  }
  return strings;
}

export function columnIndexFromRef(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * 시트 XML을 행 단위 문자열로 바꾼다. 빈 셀을 건너뛰므로 셀 참조(A1, C3)로 열 위치를 복원한다.
 * 수식(<f>)은 무시하고 엑셀이 저장한 계산 결과(<v>)를 쓴다.
 */
export function parseSheetRows(xml: string, sharedStrings: readonly string[]): string[][] {
  const rows: string[][] = [];
  let cellCount = 0;
  const rowPattern = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(xml)) !== null && rows.length < MAX_ROWS) {
    const cells: string[] = [];
    const cellPattern = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      cellCount += 1;
      if (cellCount > MAX_CELLS) {
        throw new XlsxReadError("시트가 너무 큽니다. 필요한 행만 남기고 저장해 주세요.");
      }
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? "";
      const type = /\bt="([a-zA-Z]+)"/.exec(attributes)?.[1] ?? "n";
      const column = ref ? columnIndexFromRef(ref) : cells.length;

      let value = "";
      if (type === "s") {
        const index = Number.parseInt(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "", 10);
        value = sharedStrings[index] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "b") {
        value = (/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "").trim() === "1" ? "TRUE" : "FALSE";
      } else {
        value = decodeXmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }

      if (value !== "") {
        cells[column] = value;
      }
    }

    for (let index = 0; index < cells.length; index += 1) {
      cells[index] ??= "";
    }
    rows.push(cells);
  }

  return rows;
}

/** 첫 시트 이름과 값을 읽는다. */
export async function readXlsxRows(
  bytes: ArrayBuffer,
): Promise<{ sheetName: string; rows: string[][] }> {
  if (bytes.byteLength > MAX_XLSX_BYTES) {
    throw new XlsxReadError("엑셀 파일은 5MB 이하만 읽을 수 있습니다.");
  }
  if (isOleFile(bytes)) {
    throw new XlsxReadError(
      "구형 .xls 파일은 읽지 못합니다. 엑셀에서 ‘Excel 통합 문서(.xlsx)’ 또는 CSV로 저장해 주세요.",
    );
  }
  if (!isZipFile(bytes)) {
    throw new XlsxReadError("엑셀 파일이 아닙니다. .xlsx 또는 .csv 파일을 올려 주세요.");
  }

  const entries = readCentralDirectory(bytes);
  const workbook = await readEntry(bytes, entries, "xl/workbook.xml");
  if (!workbook) {
    throw new XlsxReadError("엑셀 통합 문서를 읽지 못했습니다. .xlsx 파일인지 확인해 주세요.");
  }

  const firstSheet = /<sheet\s[^>]*?\/>/.exec(workbook)?.[0] ?? "";
  const sheetName = decodeXmlText(/\bname="([^"]*)"/.exec(firstSheet)?.[1] ?? "");
  const relationshipId = /\br:id="([^"]+)"/.exec(firstSheet)?.[1] ?? "";

  let sheetPath: string | null = null;
  const rels = await readEntry(bytes, entries, "xl/_rels/workbook.xml.rels");
  if (rels && relationshipId) {
    for (const tag of rels.match(/<Relationship\s[^>]*?\/>/g) ?? []) {
      if (/\bId="([^"]+)"/.exec(tag)?.[1] === relationshipId) {
        const target = /\bTarget="([^"]+)"/.exec(tag)?.[1] ?? "";
        sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
        break;
      }
    }
  }
  if (!sheetPath || !entries.has(sheetPath)) {
    sheetPath = [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d*\.xml$/.test(name)) ?? null;
  }
  if (!sheetPath) {
    throw new XlsxReadError("엑셀 파일 안에서 시트를 찾지 못했습니다.");
  }

  const sheet = await readEntry(bytes, entries, sheetPath);
  if (sheet === null) {
    throw new XlsxReadError("시트 내용을 읽지 못했습니다.");
  }
  const shared = await readEntry(bytes, entries, "xl/sharedStrings.xml");
  const sharedStrings = shared ? parseSharedStrings(shared) : [];

  return { sheetName, rows: parseSheetRows(sheet, sharedStrings) };
}

/** 파싱한 행을 CSV 텍스트로 바꿔 기존 가져오기 경로(열 매핑·검증)를 그대로 태운다. */
export function rowsToCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(","),
    )
    .join("\n");
}
