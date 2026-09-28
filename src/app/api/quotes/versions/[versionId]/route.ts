import { NextRequest, NextResponse } from "next/server";
import { sessionSite } from "@/lib/auth/session";
import { getVersion, isDatabaseUnavailable } from "@/features/quotes/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 확정 시점 snapshot을 그대로 돌려준다. 공개 공유 URL이 아니라 세션으로만 접근하며,
 * tenant(siteCode)가 다르면 404로 감춘다. 캐시하지 않는다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  const { versionId } = await params;
  try {
    const version = await getVersion(siteCode, versionId);
    if (!version) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(version, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
    }
    console.error("[quotes] version failed", { message: (error as Error).message });
    return NextResponse.json({ error: "version failed" }, { status: 500 });
  }
}
