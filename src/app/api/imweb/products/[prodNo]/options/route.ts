import { NextRequest, NextResponse } from "next/server";
import { listOptionDetails, listOptionGroups } from "@/lib/imweb/client";
import { getValidToken } from "@/lib/imweb/tokens";
import { sessionSite } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * 상품 하나의 옵션 정의(그룹)와 실제 옵션 조합 상세를 함께 돌려준다.
 * 옵션 정의를 모든 조합으로 임의 곱하지 않고, 실제 option-details 응답을 행의 근거로 쓴다.
 * 상세 조회가 실패하면 빈 배열을 돌려주고 호출부가 수동 입력을 요구하게 한다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ prodNo: string }> },
) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }

  const { prodNo } = await params;
  const parsed = Number(prodNo);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NextResponse.json({ error: "invalid prodNo" }, { status: 400, headers: noStore });
  }

  const record = await getValidToken(siteCode);
  if (!record) {
    return NextResponse.json(
      { error: "token unavailable", message: "앱을 다시 실행해 토큰을 갱신해 주세요." },
      { status: 409, headers: noStore },
    );
  }

  try {
    const [groups, details] = await Promise.all([
      listOptionGroups(record.accessToken, record.unitCode, parsed).catch(() => []),
      listOptionDetails(record.accessToken, record.unitCode, parsed).catch(() => []),
    ]);
    return NextResponse.json({ prodNo: parsed, groups, details }, { headers: noStore });
  } catch (error) {
    console.error("[imweb/product options] fetch failed", {
      siteCode,
      prodNo: parsed,
      message: (error as Error).message,
    });
    return NextResponse.json(
      { error: "imweb api error", message: "옵션을 불러오지 못했습니다. 수량·단가를 직접 입력해 주세요." },
      { status: 502, headers: noStore },
    );
  }
}
