import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEvent, cancelSubscription, getEntitlement, verifyWebhookSignature } from "./service";
import { billingStore, type BillingEventRecord } from "./store";

const SITE = "__billing_service_test__";

const makeEvent = (overrides: Partial<BillingEventRecord> = {}): BillingEventRecord => ({
  provider: "pg",
  eventId: `evt_${Math.random().toString(36).slice(2)}`,
  siteCode: SITE,
  type: "payment.succeeded",
  amount: 9900,
  currency: "KRW",
  occurredAt: new Date().toISOString(),
  attribution: "imweb",
  payload: { subscriptionId: "sub_1", customerId: "cus_1" },
  ...overrides,
});

beforeEach(async () => {
  // 메모리 저장소를 쓰더라도 이전 테스트의 구독이 남지 않게 정리한다.
  await billingStore.upsertSubscription({
    siteCode: SITE,
    planCode: "free",
    status: "cancelled",
    provider: "",
    providerCustomerId: "",
    providerSubscriptionId: "",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: true,
    updatedAt: new Date().toISOString(),
  });
});

afterEach(() => {
  delete process.env.BILLING_WEBHOOK_SECRET;
});

describe("결제 웹훅 서명 검증", () => {
  it("시크릿이 없으면 거부한다(조용히 통과하지 않는다)", () => {
    expect(verifyWebhookSignature("{}", "whatever")).toBe(false);
  });

  it("올바른 HMAC 서명만 통과한다", () => {
    process.env.BILLING_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ type: "payment.succeeded" });
    const good = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, good)).toBe(true);
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
    expect(verifyWebhookSignature("{}", good)).toBe(false);
  });
});

describe("결제 이벤트 반영", () => {
  it("결제 성공 후에는 활성 상태가 된다", async () => {
    const result = await applyEvent(makeEvent());
    expect(result.applied).toBe(true);
    const entitlement = await getEntitlement(SITE);
    expect(entitlement.status).toBe("active");
    expect(entitlement.canUseApp).toBe(true);
  });

  it("같은 (provider, event_id)는 두 번 반영하지 않는다", async () => {
    const event = makeEvent({ eventId: "evt_duplicate" });
    const first = await applyEvent(event);
    const second = await applyEvent(event);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
  });

  it("결제 실패는 past_due로 내린다", async () => {
    await applyEvent(makeEvent({ type: "payment.failed", eventId: "evt_fail" }));
    const entitlement = await getEntitlement(SITE);
    expect(entitlement.status).toBe("past_due");
    expect(entitlement.canUseApp).toBe(false);
  });

  it("해지하면 다음 회차 청구가 막힌다", async () => {
    await applyEvent(makeEvent({ eventId: "evt_ok" }));
    await cancelSubscription(SITE);
    const entitlement = await getEntitlement(SITE);
    expect(entitlement.status).toBe("cancelled");
    expect(entitlement.canUseApp).toBe(false);
    expect(entitlement.cancelAtPeriodEnd).toBe(true);
  });
});
