import { NextRequest, NextResponse } from "next/server";
import { applyEvent, verifyWebhookSignature } from "@/lib/billing/service";
import type { BillingEventRecord, BillingEventType } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: BillingEventType[] = [
  "subscription.activated",
  "subscription.renewed",
  "subscription.cancelled",
  "payment.succeeded",
  "payment.failed",
  "refund.succeeded",
];

const asString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const asAmount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(asString(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : -1;
};

/**
 * 결제 웹훅. 서명(HMAC)을 검증한 뒤에만 반영한다.
 * 브라우저 성공 URL만으로 유료 처리하지 않기 위한 서버 검증 창구다.
 * 같은 (provider, event_id)는 저장소 유니크가 막아 중복 청구·중복 연장을 방지한다.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-imq-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = asString(body.type) as BillingEventType;
  const eventId = asString(body.eventId ?? body.id);
  const siteCode = asString(body.siteCode);
  const provider = asString(body.provider) || process.env.BILLING_PROVIDER || "unknown";
  const amount = asAmount(body.amount ?? 0);

  if (!ALLOWED.includes(type) || !eventId || !siteCode || amount < 0) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }
  if (provider !== (process.env.BILLING_PROVIDER ?? provider)) {
    return NextResponse.json({ error: "unexpected provider" }, { status: 400 });
  }

  const event: BillingEventRecord = {
    provider,
    eventId,
    siteCode,
    type,
    amount,
    currency: asString(body.currency) || "KRW",
    occurredAt: asString(body.occurredAt) || new Date().toISOString(),
    attribution: asString(body.attribution) || "unknown",
    payload: (body.payload as Record<string, unknown>) ?? {},
  };

  const result = await applyEvent(event);
  // 중복 이벤트도 200을 돌려 재전송 스톰을 막는다.
  return NextResponse.json({ ok: true, ...result });
}
