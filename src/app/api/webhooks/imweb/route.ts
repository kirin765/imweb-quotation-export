import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { deleteTokens } from "@/lib/imweb/tokens";
import { cancelSubscription } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 아임웹 연동해제 웹훅. 다만 웹훅 유실·미전송이 있을 수 있으므로 이 경로만 믿지 않는다.
 * 앱 화면의 연동해제(/api/auth/uninstall)가 기본이고, 이 웹훅은 보조 수단이다.
 * 서명 수단이 문서에 없어, 설정된 경우에만 공유 시크릿 헤더로 확인하고 항상 200을 돌려 재전송을 막는다.
 */
function verify(req: NextRequest): boolean {
  const expected = process.env.IMWEB_WEBHOOK_SECRET ?? "";
  if (!expected) {
    return true; // 시크릿 미설정(개발)일 때만 통과. 운영에서는 반드시 설정한다.
  }
  const received = req.headers.get("x-imq-webhook-secret") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!verify(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: {
    eventType?: string;
    siteCode?: string;
    data?: { siteCode?: string };
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const siteCode = body.siteCode ?? body.data?.siteCode;
  if (body.eventType === "INTEGRATION_CANCELLATION" && siteCode) {
    try {
      await deleteTokens(siteCode);
      await cancelSubscription(siteCode);
      console.info("[webhooks/imweb] token removed", { siteCode });
    } catch (error) {
      console.error("[webhooks/imweb] cleanup failed", { message: (error as Error).message });
    }
  }
  return NextResponse.json({ ok: true });
}
