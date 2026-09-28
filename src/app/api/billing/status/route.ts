import { NextRequest, NextResponse } from "next/server";
import { sessionSite } from "@/lib/auth/session";
import { getEntitlement, isPaidBillingEnabled } from "@/lib/billing/service";
import { planConfig } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

/** 현재 사이트의 이용권 상태. 유료 결제 연동이 준비되지 않았으면 upgradeAvailable=false. */
export async function GET(req: NextRequest) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const entitlement = await getEntitlement(siteCode);
  const config = planConfig();
  return NextResponse.json(
    {
      entitlement,
      plan: { code: config.code, name: config.name, priceKrw: config.priceKrw, trialDays: config.trialDays },
      upgradeAvailable: isPaidBillingEnabled(),
    },
    { headers: noStore },
  );
}
