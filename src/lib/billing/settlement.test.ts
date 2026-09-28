import { afterEach, describe, expect, it } from "vitest";
import { buildSettlement, settlementToCsv } from "./settlement";
import type { BillingEventRecord } from "./store";

const event = (overrides: Partial<BillingEventRecord>): BillingEventRecord => ({
  provider: "pg",
  eventId: "evt_1",
  siteCode: "S2025012450f7813d2ddau",
  type: "payment.succeeded",
  amount: 9900,
  currency: "KRW",
  occurredAt: "2026-09-05T10:00:00.000Z",
  attribution: "imweb",
  payload: {},
  ...overrides,
});

afterEach(() => {
  delete process.env.BILLING_REVENUE_SHARE_RATE;
});

describe("월별 정산 자료", () => {
  it("공급가액과 VAT를 분리하고 제안 수익쉐어를 참고로만 채운다", () => {
    process.env.BILLING_REVENUE_SHARE_RATE = "0.2";
    const report = buildSettlement("2026-09", [event({})]);
    const [row] = report.rows;
    expect(row.supplyAmount).toBe(9900);
    expect(row.vat).toBe(990);
    expect(row.total).toBe(10890);
    expect(row.proposedShareRate).toBe(0.2);
    expect(row.proposedShareAmount).toBe(1980);
    expect(row.status).toBe("preview");
    expect(report.totals.supplyAmount).toBe(9900);
  });

  it("비율이 설정되지 않으면 수익쉐어 금액을 비운다", () => {
    const report = buildSettlement("2026-09", [event({})]);
    expect(report.rows[0].proposedShareAmount).toBeNull();
    expect(report.notes.join(" ")).toContain("BILLING_REVENUE_SHARE_RATE");
  });

  it("환불은 별도로 집계하고 정산 상태는 미리보기로 둔다", () => {
    const report = buildSettlement("2026-09", [
      event({ eventId: "evt_1" }),
      event({ eventId: "evt_2", type: "refund.succeeded", amount: 9900 }),
    ]);
    expect(report.totals.refundAmount).toBe(9900);
    expect(report.notes.join(" ")).toContain("합의 전 미리보기");
  });

  it("CSV는 헤더와 거래 행을 만든다", () => {
    const report = buildSettlement("2026-09", [event({})]);
    const csv = settlementToCsv(report);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("settlement_month");
    expect(lines[0]).toContain("proposed_share_rate");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("S2025012450f7813d2ddau");
  });
});
