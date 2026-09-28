import { billingStore, type BillingEventRecord } from "./store";

const VAT_RATE = 0.1;
const round = (value: number) => Math.round(value);

export type SettlementRow = {
  settlementMonth: string;
  siteCode: string;
  transactionId: string;
  eventType: string;
  occurredAt: string;
  /** imweb | direct | existing | unknown — 정산 대상 귀속. */
  attribution: string;
  supplyAmount: number;
  vat: number;
  total: number;
  refundAmount: number;
  discountAmount: number;
  /** 합의 전에는 null. BILLING_REVENUE_SHARE_RATE가 있을 때만 채운다. */
  proposedShareRate: number | null;
  proposedShareAmount: number | null;
  status: "preview" | "confirmed";
};

export type SettlementReport = {
  month: string;
  rows: SettlementRow[];
  totals: {
    supplyAmount: number;
    vat: number;
    total: number;
    refundAmount: number;
    proposedShareAmount: number | null;
  };
  /** 미합의·가정 사항을 숨기지 않고 적는다. */
  notes: string[];
};

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function proposedRate(): number | null {
  const raw = process.env.BILLING_REVENUE_SHARE_RATE;
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

/**
 * 월별 정산 자료. 합의되지 않은 계산(PG 수수료 공제, 환불 차감월 등)은 하지 않는다.
 * 공급가액과 VAT를 분리해 두고, 제안 수익쉐어 비율이 설정된 경우에만 참고 금액을 채운다.
 */
export function buildSettlement(month: string, events: readonly BillingEventRecord[]): SettlementReport {
  const rate = proposedRate();
  const rows: SettlementRow[] = [];

  for (const event of events) {
    const amount = event.amount;
    const isCharge = event.type === "payment.succeeded" || event.type === "subscription.renewed";
    const isRefund = event.type === "refund.succeeded";
    const supplyAmount = isCharge ? amount : 0;
    const refundAmount = isRefund ? amount : 0;
    const discountAmount = isCharge ? num(event.payload.discount) : 0;
    const vat = round(supplyAmount * VAT_RATE);
    rows.push({
      settlementMonth: month,
      siteCode: event.siteCode,
      transactionId: event.eventId,
      eventType: event.type,
      occurredAt: event.occurredAt,
      attribution: event.attribution,
      supplyAmount,
      vat,
      total: supplyAmount + vat,
      refundAmount,
      discountAmount,
      proposedShareRate: rate,
      proposedShareAmount: rate === null ? null : round(supplyAmount * rate),
      status: "preview",
    });
  }

  const totals = rows.reduce(
    (acc, row) => ({
      supplyAmount: acc.supplyAmount + row.supplyAmount,
      vat: acc.vat + row.vat,
      total: acc.total + row.total,
      refundAmount: acc.refundAmount + row.refundAmount,
      proposedShareAmount:
        row.proposedShareAmount === null
          ? acc.proposedShareAmount
          : (acc.proposedShareAmount ?? 0) + row.proposedShareAmount,
    }),
    { supplyAmount: 0, vat: 0, total: 0, refundAmount: 0, proposedShareAmount: null as number | null },
  );

  const notes = [
    "이 자료는 합의 전 미리보기입니다. 계약 문안이 확정되면 같은 계산을 확정값으로 다시 산출합니다.",
    "VAT는 공급가액의 10%로 가정해 표시했습니다. 실제 세금계산서 발행 기준에 맞춰 확정합니다.",
    "PG 수수료 공제, 환불 차감월, 할인 반영 방식은 합의되지 않아 임의로 적용하지 않았습니다.",
  ];
  if (rate === null) {
    notes.push("BILLING_REVENUE_SHARE_RATE가 설정되지 않아 수익쉐어 금액은 비워 두었습니다.");
  }

  return { month, rows, totals, notes };
}

export async function getSettlementReport(month: string): Promise<SettlementReport> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("정산월은 YYYY-MM 형식이어야 합니다.");
  }
  const events = await billingStore.listEvents(month);
  return buildSettlement(month, events);
}

const CSV_HEADERS = [
  "settlement_month",
  "site_code",
  "transaction_id",
  "event_type",
  "occurred_at",
  "attribution",
  "supply_amount",
  "vat",
  "total",
  "refund_amount",
  "discount_amount",
  "proposed_share_rate",
  "proposed_share_amount",
  "status",
];

const csvCell = (value: string | number | null): string => {
  if (value === null) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** 정산 자료를 CSV로 내보낸다. 정산 담당자에게 그대로 전달할 수 있는 평면 표다. */
export function settlementToCsv(report: SettlementReport): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of report.rows) {
    lines.push(
      [
        row.settlementMonth,
        row.siteCode,
        row.transactionId,
        row.eventType,
        row.occurredAt,
        row.attribution,
        row.supplyAmount,
        row.vat,
        row.total,
        row.refundAmount,
        row.discountAmount,
        row.proposedShareRate,
        row.proposedShareAmount,
        row.status,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
