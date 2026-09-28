import { createHmac, timingSafeEqual } from "node:crypto";
import {
  evaluateEntitlement,
  periodEndFromNow,
  planConfig,
  trialEndFromNow,
  type Entitlement,
} from "./plans";
import { billingStore, type BillingEventRecord, type SubscriptionRecord } from "./store";

const DAY = 24 * 60 * 60 * 1000;

/** 유료 결제수단이 실제로 붙었는지. 이 값이 true여야 업그레이드 UI를 노출한다. */
export const isPaidBillingEnabled = () => planConfig().paid;

/**
 * 웹훅 본문의 HMAC 서명을 검증한다. 브라우저 성공 URL만으로 유료 처리하지 않기 위한 1차 방어다.
 * 서명 헤더가 없거나 시크릿이 미설정이면 거부한다(개발 중에도 조용히 통과시키지 않는다).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BILLING_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature.trim());
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 설치 시 1회. 유료 연동이 준비된 배포에서만 체험 기간을 만든다. */
export async function startTrialIfNeeded(siteCode: string): Promise<Entitlement> {
  const config = planConfig();
  const existing = await billingStore.getSubscription(siteCode);
  if (existing) {
    return evaluateEntitlement(existing);
  }
  if (!config.paid || config.trialDays <= 0) {
    return evaluateEntitlement({
      siteCode,
      planCode: "free",
      status: "free",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }
  const record: SubscriptionRecord = {
    siteCode,
    planCode: config.code,
    status: "trialing",
    provider: process.env.BILLING_PROVIDER ?? "",
    providerCustomerId: "",
    providerSubscriptionId: "",
    trialEndsAt: trialEndFromNow(config.trialDays),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: new Date().toISOString(),
  };
  await billingStore.upsertSubscription(record);
  return evaluateEntitlement(record);
}

export async function getEntitlement(siteCode: string): Promise<Entitlement> {
  const record = await billingStore.getSubscription(siteCode);
  if (!record) {
    return evaluateEntitlement({
      siteCode,
      planCode: "free",
      status: "free",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }
  return evaluateEntitlement(record);
}

const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

/**
 * 결제 웹훅 이벤트를 반영한다. 같은 (provider, event_id)는 저장소 유니크 인덱스가 막아
 * 중복 청구·중복 연장이 일어나지 않는다. 이미 처리한 이벤트면 applied=false로 알린다.
 */
export async function applyEvent(
  event: BillingEventRecord,
): Promise<{ duplicate: boolean; applied: boolean }> {
  const { duplicate } = await billingStore.recordEvent(event);
  if (duplicate) {
    return { duplicate: true, applied: false };
  }

  const record =
    (await billingStore.getSubscription(event.siteCode)) ??
    ({
      siteCode: event.siteCode,
      planCode: planConfig().code,
      status: "active",
      provider: event.provider,
      providerCustomerId: "",
      providerSubscriptionId: "",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: new Date().toISOString(),
    } satisfies SubscriptionRecord);

  const payload = event.payload;
  const customerId = str(payload.customerId) || record.providerCustomerId;
  const subscriptionId = str(payload.subscriptionId) || record.providerSubscriptionId;

  switch (event.type) {
    case "subscription.activated":
      record.status = "active";
      record.trialEndsAt = null;
      record.currentPeriodEnd = str(payload.currentPeriodEnd) || periodEndFromNow(31);
      record.cancelAtPeriodEnd = false;
      break;
    case "subscription.renewed":
      record.status = "active";
      record.currentPeriodEnd = str(payload.currentPeriodEnd) || periodEndFromNow(31);
      break;
    case "payment.succeeded":
      record.status = "active";
      record.currentPeriodEnd = str(payload.currentPeriodEnd) || periodEndFromNow(31);
      break;
    case "payment.failed":
      record.status = "past_due";
      break;
    case "subscription.cancelled":
      // 기간말 해지면 만료까지 사용할 수 있고, 즉시 해지면 상태를 cancelled로 내린다.
      if (payload.atPeriodEnd === true || payload.atPeriodEnd === "true") {
        record.cancelAtPeriodEnd = true;
      } else {
        record.status = "cancelled";
        record.cancelAtPeriodEnd = true;
      }
      break;
    case "refund.succeeded":
      // 환불은 정산 자료에만 남기고 이용권 상태는 건드리지 않는다.
      break;
  }

  record.provider = event.provider || record.provider;
  record.providerCustomerId = customerId;
  record.providerSubscriptionId = subscriptionId;
  record.updatedAt = new Date().toISOString();
  await billingStore.upsertSubscription(record);

  return { duplicate: false, applied: true };
}

/**
 * 연동 해제 시 호출. 다음 회차 청구가 이어지지 않도록 구독을 해지 상태로 내린다.
 * 실제 PG 해지는 이벤트로 확정되며, 여기서는 앱 쪽 상태를 먼저 막는다.
 */
export async function cancelSubscription(siteCode: string): Promise<void> {
  const record = await billingStore.getSubscription(siteCode);
  if (!record) {
    return;
  }
  record.status = "cancelled";
  record.cancelAtPeriodEnd = true;
  record.currentPeriodEnd = record.currentPeriodEnd ?? new Date(Date.now() + DAY).toISOString();
  record.updatedAt = new Date().toISOString();
  await billingStore.upsertSubscription(record);
}

export const billingStoreKindForDisplay = () => billingStore.kind;
