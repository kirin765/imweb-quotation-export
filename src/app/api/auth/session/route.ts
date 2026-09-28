import { NextRequest, NextResponse } from "next/server";
import { SCOPES, billingConfigured } from "@/lib/imweb/config";
import { sessionSite } from "@/lib/auth/session";
import { tokenStore } from "@/lib/imweb/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 브라우저가 "이 브라우저가 어느 사이트의 앱 세션을 들고 있는가"만 확인하는 창구. */
export async function GET(req: NextRequest) {
  const siteCode = sessionSite(req);
  const record = siteCode ? await tokenStore.get(siteCode) : null;
  return NextResponse.json(
    {
      siteCode,
      siteName: record?.siteName ?? null,
      unitCode: record?.unitCode ?? null,
      unitCurrency: record?.unitCurrency ?? null,
      installed: siteCode !== null && record !== null,
      storeKind: tokenStore.kind,
      scopes: SCOPES,
      billingEnabled: billingConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
