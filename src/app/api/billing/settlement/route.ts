import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSettlementReport, settlementToCsv } from "@/lib/billing/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.SETTLEMENT_EXPORT_TOKEN ?? "";
  const header = req.headers.get("authorization") ?? "";
  const received = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !received) {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * 월별 정산 자료 CSV. 개발자(제휴사) 측 운영자만 쓰는 창구라 별도 토큰으로 보호한다.
 * 토큰이 설정되지 않았으면 비활성으로 두고 열지 않는다.
 */
export async function GET(req: NextRequest) {
  if (!process.env.SETTLEMENT_EXPORT_TOKEN) {
    return NextResponse.json({ error: "settlement export disabled" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") ?? "";
  try {
    const report = await getSettlementReport(month);
    const csv = settlementToCsv(report);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="settlement-${month}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
