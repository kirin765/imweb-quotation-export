import {
  DEFAULT_SUPPLIER,
  createDocumentNumber,
  createEmptyItem,
  type QuoteDocument,
  type QuoteItem,
  newId,
  type SupplierInfo,
} from "@/features/quotes/model";

export const SAMPLE_SUPPLIER: SupplierInfo = { ...DEFAULT_SUPPLIER };

export const SAMPLE_ITEMS: QuoteItem[] = [
  { itemCode: "SAMPLE-001", productName: "샘플 타월", optionName: "화이트", quantity: 10, unitPrice: 5000 },
  { itemCode: "SAMPLE-002", productName: "샘플 컵", optionName: "300ml", quantity: 20, unitPrice: 3000 },
  { itemCode: "SAMPLE-003", productName: "샘플 에코백", optionName: "대형", quantity: 5, unitPrice: 4200 },
  { itemCode: "SAMPLE-004", productName: "샘플 텀블러", optionName: "500ml", quantity: 12, unitPrice: 8900 },
  { itemCode: "SAMPLE-005", productName: "샘플 아로마 캔들", optionName: "라벤더", quantity: 30, unitPrice: 6500 },
  { itemCode: "SAMPLE-006", productName: "샘플 무지 노트", optionName: "A5", quantity: 100, unitPrice: 1200 },
  { itemCode: "SAMPLE-007", productName: "샘플 볼펜", optionName: "검정 0.5mm", quantity: 200, unitPrice: 600 },
  { itemCode: "SAMPLE-008", productName: "샘플 스티커 팩", optionName: "다이어리용", quantity: 40, unitPrice: 1800 },
  { itemCode: "SAMPLE-009", productName: "샘플 마우스패드", optionName: "원형", quantity: 15, unitPrice: 5500 },
  { itemCode: "SAMPLE-010", productName: "샘플 파우치", optionName: "네이비", quantity: 8, unitPrice: 7300 },
].map((item) => ({ ...item, id: newId() }));

export const SAMPLE_CSV = [
  "item_code,product_name,option_name,quantity,unit_price",
  "SAMPLE-001,샘플 타월,화이트,10,5000",
  "SAMPLE-002,샘플 컵,300ml,20,3000",
].join("\n");

export function createSampleDocument(now: Date = new Date()): QuoteDocument {
  return {
    documentNumber: createDocumentNumber(now),
    version: 1,
    createdAt: now.toISOString(),
    recipientCompany: "샘플거래처",
    supplier: { ...SAMPLE_SUPPLIER },
    validUntil: "",
    deliveryTerms: "주문 확정 후 7일 이내 출고, 택배 배송",
    priceCondition: "부가세 별도 금액입니다.",
    notes: "합성 데이터로 작성한 데모 견적입니다.",
    items: SAMPLE_ITEMS.map((item) => ({ ...item, id: newId() })),
    adjustment: { description: "배송비", amount: 3000 },
  };
}

export function createEmptyDocument(now: Date = new Date()): QuoteDocument {
  return {
    documentNumber: createDocumentNumber(now),
    version: 1,
    createdAt: now.toISOString(),
    recipientCompany: "",
    supplier: { ...SAMPLE_SUPPLIER },
    validUntil: "",
    deliveryTerms: "",
    priceCondition: "부가세 별도 금액입니다.",
    notes: "",
    items: [createEmptyItem()],
    adjustment: null,
  };
}
