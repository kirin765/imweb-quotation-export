export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 200;
export const MAX_ITEMS = 200;
export const MAX_QUANTITY = 1_000_000;
export const MAX_UNIT_PRICE = 1_000_000_000;
export const MAX_ADJUSTMENT = 1_000_000_000;

export const MAX_NAME_LENGTH = 200;
export const MAX_CODE_LENGTH = 100;
export const MAX_NOTE_LENGTH = 500;

export type QuoteItem = {
  id: string;
  itemCode: string;
  productName: string;
  optionName: string;
  quantity: number;
  unitPrice: number;
};

export type SupplierInfo = {
  companyName: string;
  businessNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
};

/** 설정 화면에서 운영자가 바꾸기 전까지 쓰는 합성 공급자 정보. 실제 사업자 정보가 아니다. */
export const DEFAULT_SUPPLIER: SupplierInfo = {
  companyName: "(주)샘플공급",
  businessNumber: "000-00-00000",
  contactName: "홍샘플",
  contactPhone: "02-0000-0000",
  contactEmail: "sample@example.com",
  address: "서울특별시 샘플구 샘플로 1",
};

export type QuoteAdjustment = {
  description: string;
  amount: number;
};

export type QuoteDocument = {
  documentNumber: string;
  version: number;
  createdAt: string;
  recipientCompany: string;
  supplier: SupplierInfo;
  validUntil: string;
  deliveryTerms: string;
  priceCondition: string;
  notes: string;
  items: QuoteItem[];
  adjustment: QuoteAdjustment | null;
};

export type ItemFieldErrors = Partial<Record<keyof QuoteItem, string>>;

export type DocumentValidation = {
  documentErrors: {
    field: string;
    message: string;
  }[];
  itemErrors: ItemFieldErrors[];
  adjustmentError: string | null;
  subtotal: number;
  adjustmentAmount: number;
  total: number;
  valid: boolean;
};

export function createEmptyItem(): QuoteItem {
  return {
    id: newId(),
    itemCode: "",
    productName: "",
    optionName: "",
    quantity: 1,
    unitPrice: 0,
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function lineAmount(item: QuoteItem): number {
  return item.quantity * item.unitPrice;
}

export function itemsSubtotal(items: readonly QuoteItem[]): number {
  let subtotal = 0;
  for (const item of items) {
    subtotal += lineAmount(item);
  }
  return subtotal;
}

export function adjustmentAmount(adjustment: QuoteAdjustment | null): number {
  return adjustment ? adjustment.amount : 0;
}

export function documentTotal(doc: QuoteDocument): number {
  return itemsSubtotal(doc.items) + adjustmentAmount(doc.adjustment);
}

export function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseIntegerInput(raw: string, allowNegative = false): number {
  const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;
  const cleaned = raw.trim();
  if (cleaned === "" || cleaned === "-") {
    return 0;
  }
  if (!pattern.test(cleaned)) {
    const digitsOnly = cleaned.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
    const parsed = Number.parseInt(digitsOnly === "" || digitsOnly === "-" ? "0" : digitsOnly, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateItemFields(item: QuoteItem): ItemFieldErrors {
  const errors: ItemFieldErrors = {};

  if (item.productName.trim() === "") {
    errors.productName = "상품명은 필수입니다.";
  } else if (item.productName.trim().length > MAX_NAME_LENGTH) {
    errors.productName = `상품명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`;
  }

  if (item.itemCode.length > MAX_CODE_LENGTH) {
    errors.itemCode = `품목 코드는 ${MAX_CODE_LENGTH}자 이하여야 합니다.`;
  }

  if (item.optionName.length > MAX_NAME_LENGTH) {
    errors.optionName = `옵션명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`;
  }

  if (!isPositiveInteger(item.quantity)) {
    errors.quantity = "수량은 1 이상의 정수여야 합니다.";
  } else if (item.quantity > MAX_QUANTITY) {
    errors.quantity = `수량은 ${MAX_QUANTITY.toLocaleString("ko-KR")} 이하여야 합니다.`;
  }

  if (!isNonNegativeInteger(item.unitPrice)) {
    errors.unitPrice = "단가는 0 이상의 정수(원)여야 합니다.";
  } else if (item.unitPrice > MAX_UNIT_PRICE) {
    errors.unitPrice = `단가는 ${MAX_UNIT_PRICE.toLocaleString("ko-KR")}원 이하여야 합니다.`;
  }

  if (Number.isSafeInteger(item.quantity) && Number.isSafeInteger(item.unitPrice)) {
    if (!Number.isSafeInteger(lineAmount(item))) {
      errors.quantity = "수량 × 단가 금액이 계산 가능한 범위를 초과했습니다.";
    }
  }

  return errors;
}

export function validateDocument(doc: QuoteDocument): DocumentValidation {
  const documentErrors: { field: string; message: string }[] = [];

  if (doc.recipientCompany.trim() === "") {
    documentErrors.push({ field: "recipientCompany", message: "수신 회사명은 필수입니다." });
  } else if (doc.recipientCompany.trim().length > MAX_NAME_LENGTH) {
    documentErrors.push({
      field: "recipientCompany",
      message: `수신 회사명은 ${MAX_NAME_LENGTH}자 이하여야 합니다.`,
    });
  }

  if (doc.documentNumber.trim() === "") {
    documentErrors.push({ field: "documentNumber", message: "문서 번호는 필수입니다." });
  }

  if (!Number.isSafeInteger(doc.version) || doc.version < 1) {
    documentErrors.push({ field: "version", message: "버전은 1 이상의 정수여야 합니다." });
  }

  if (doc.validUntil.trim() !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(doc.validUntil.trim())) {
    documentErrors.push({ field: "validUntil", message: "유효기한은 YYYY-MM-DD 형식이어야 합니다." });
  }

  if (doc.notes.length > MAX_NOTE_LENGTH) {
    documentErrors.push({ field: "notes", message: `비고는 ${MAX_NOTE_LENGTH}자 이하여야 합니다.` });
  }

  if (doc.items.length === 0) {
    documentErrors.push({ field: "items", message: "품목을 1개 이상 추가해야 합니다." });
  } else if (doc.items.length > MAX_ITEMS) {
    documentErrors.push({ field: "items", message: `품목은 ${MAX_ITEMS}행 이하여야 합니다.` });
  }

  const itemErrors = doc.items.map(validateItemFields);

  let adjustmentError: string | null = null;
  if (doc.adjustment) {
    if (doc.adjustment.description.trim() === "") {
      adjustmentError = "조정 금액에는 설명이 필요합니다. 예: 배송비, 일괄 할인.";
    } else if (!Number.isSafeInteger(doc.adjustment.amount)) {
      adjustmentError = "조정 금액은 정수(원)여야 합니다.";
    } else if (Math.abs(doc.adjustment.amount) > MAX_ADJUSTMENT) {
      adjustmentError = `조정 금액은 ±${MAX_ADJUSTMENT.toLocaleString("ko-KR")}원 이하여야 합니다.`;
    }
  }

  const subtotal = itemsSubtotal(doc.items);
  const adjustment = adjustmentAmount(doc.adjustment);
  const total = subtotal + adjustment;

  if (!Number.isSafeInteger(subtotal)) {
    documentErrors.push({ field: "items", message: "상품 합계가 계산 가능한 범위를 초과했습니다." });
  } else if (total < 0) {
    documentErrors.push({ field: "total", message: "조정 후 총액은 0원보다 작을 수 없습니다." });
  }

  const hasItemError = itemErrors.some((errors) => Object.keys(errors).length > 0);
  const valid =
    documentErrors.length === 0 && !hasItemError && adjustmentError === null && total >= 0;

  return {
    documentErrors,
    itemErrors,
    adjustmentError,
    subtotal,
    adjustmentAmount: adjustment,
    total,
    valid,
  };
}

export function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function createDocumentNumber(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Q${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${now
    .getHours()
    .toString()
    .padStart(2, "0")}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function sanitizeFileNamePart(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return sanitized.slice(0, 80) || "quote";
}
