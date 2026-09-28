import { NextRequest, NextResponse } from "next/server";
import { cancelIntegration } from "@/lib/imweb/client";
import { getValidToken, deleteTokens } from "@/lib/imweb/tokens";
import { markUninstalled } from "@/features/quotes/server/repo";
import { cancelSubscription } from "@/lib/billing/service";
import { clearSessionCookie, sessionSite } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * 연동 해제. 관리자 화면에서 직접 제공한다(삭제 웹훅을 기다리지 않는다).
 * 1) 아임웹 연동해제 API 호출 2) 토큰 삭제 3) 앱 쪽 설치 표시 해제 4) 이용권 다음 회차 청구 중단.
 * 견적 문서는 별도 삭제 정책에 따라 이 호출로 지우지 않는다(화면에서 안내).
 */
export async function POST(req: NextRequest) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }

  let remote: "cancelled" | "failed" | "skipped" = "skipped";
  try {
    const record = await getValidToken(siteCode);
    if (record) {
      try {
        await cancelIntegration(record.accessToken);
        remote = "cancelled";
      } catch (error) {
        // 원격 해제가 실패해도 토큰은 지운다. 사용자가 앱을 지우면 토큰이 무효가 된다.
        remote = "failed";
        console.error("[auth/uninstall] integration-cancellation failed", {
          siteCode,
          message: (error as Error).message,
        });
      }
    }
  } finally {
    await deleteTokens(siteCode);
    try {
      await markUninstalled(siteCode);
    } catch (error) {
      // DB가 없어도 해제 자체는 성공으로 본다(토큰은 이미 지웠다).
      console.error("[auth/uninstall] markUninstalled failed", { message: (error as Error).message });
    }
    try {
      await cancelSubscription(siteCode);
    } catch (error) {
      console.error("[auth/uninstall] cancelSubscription failed", { message: (error as Error).message });
    }
  }

  const res = NextResponse.json({ ok: true, remote }, { headers: noStore });
  res.cookies.set(clearSessionCookie());
  return res;
}
