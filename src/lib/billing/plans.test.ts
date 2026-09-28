import { describe, expect, it } from "vitest";
import { evaluateEntitlement } from "./plans";

const NOW = Date.parse("2026-09-28T00:00:00.000Z");

const base = {
  siteCode: "S2025012450f7813d2ddau",
  planCode: "quote-monthly",
  cancelAtPeriodEnd: false,
  now: NOW,
};

describe("이용권 판정", () => {
  it("체험 기간이 남아 있으면 사용할 수 있다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      status: "trialing",
      trialEndsAt: new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodEnd: null,
    });
    expect(entitlement.status).toBe("trialing");
    expect(entitlement.canUseApp).toBe(true);
  });

  it("체험이 끝나면 쓰기를 막는다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      status: "trialing",
      trialEndsAt: new Date(NOW - 1000).toISOString(),
      currentPeriodEnd: null,
    });
    expect(entitlement.status).toBe("expired");
    expect(entitlement.canUseApp).toBe(false);
  });

  it("활성 구독은 기간이 남아 있으면 쓸 수 있다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      status: "active",
      trialEndsAt: null,
      currentPeriodEnd: new Date(NOW + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(entitlement.status).toBe("active");
    expect(entitlement.isPaid).toBe(true);
  });

  it("기간이 지난 active 구독은 만료로 본다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      status: "active",
      trialEndsAt: null,
      currentPeriodEnd: new Date(NOW - 1000).toISOString(),
    });
    expect(entitlement.status).toBe("expired");
    expect(entitlement.canUseApp).toBe(false);
  });

  it("결제 실패는 past_due로 막는다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      status: "past_due",
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
    expect(entitlement.status).toBe("past_due");
    expect(entitlement.canUseApp).toBe(false);
  });

  it("구독 정보가 없으면 무료 플랜으로 쓸 수 있다", () => {
    const entitlement = evaluateEntitlement({
      ...base,
      planCode: "free",
      status: "free",
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
    expect(entitlement.status).toBe("free");
    expect(entitlement.canUseApp).toBe(true);
    expect(entitlement.isPaid).toBe(false);
  });
});
