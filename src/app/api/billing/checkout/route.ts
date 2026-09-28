import { NextRequest, NextResponse } from "next/server";
import { sessionSite } from "@/lib/auth/session";
import { isPaidBillingEnabled } from "@/lib/billing/service";
import { planConfig } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * 유료 이용권 결제 시작. 결제수단이 확정되지 않은 상태에서는 유료 처리를 하지 않는다.
 * 실제 PG 연동이 붙으면 여기서 서버가 만든 결제 세션 URL로 리다이렉트하고,
 * 최종 상태는 반드시 웹훅(/api/billing/events)의 서명 검증으로만 확정한다.
 */
export async function POST(req: NextRequest) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }

  if (!isPaidBillingEnabled()) {
    return NextResponse.json(
      {
        error: "billing not configured",
        message: "결제수단이 아직 설정되지 않았습니다. 무료 플랜으로 계속 사용할 수 있습니다.",
      },
      { status: 503, headers: noStore },
    );
  }

  const checkoutUrl = process.env.BILLING_CHECKOUT_URL ?? "";
  if (!checkoutUrl) {
    return NextResponse.json(
      {
        error: "checkout unavailable",
        message: "결제 페이지 주소가 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 501, headers: noStore },
    );
  }

  const config = planConfig();
  const url = new URL(checkoutUrl);
  url.searchParams.set("siteCode", siteCode);
  url.searchParams.set("planCode", config.code);
  url.searchParams.set("amount", String(config.priceKrw));
  url.searchParams.set("currency", "KRW");
  return NextResponse.json({ checkoutUrl: url.toString() }, { headers: noStore });
}
