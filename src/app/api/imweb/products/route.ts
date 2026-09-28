import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/lib/imweb/client";
import { getValidToken } from "@/lib/imweb/tokens";
import { sessionSite } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * 설치된 사이트의 상품 목록. 세션이 없으면 아무 것도 돌려주지 않는다.
 * KRW 유닛이 아니면 금액을 원 단위로 다룰 수 없으므로 목록을 비우고 이유를 안내한다.
 */
export async function GET(req: NextRequest) {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }

  const record = await getValidToken(siteCode);
  if (!record) {
    return NextResponse.json(
      { error: "token unavailable", message: "앱을 다시 실행해 토큰을 갱신해 주세요." },
      { status: 409, headers: noStore },
    );
  }

  if (record.unitCurrency.toUpperCase() !== "KRW") {
    return NextResponse.json(
      {
        siteCode,
        products: [],
        currency: record.unitCurrency,
        currencyWarning: `선택된 유닛의 통화가 ${record.unitCurrency}입니다. 이 앱은 KRW 상품만 견적에 불러옵니다. 아임웹에서 KRW 유닛을 기본으로 두거나, 상품·수량·단가를 수동으로 입력해 주세요.`,
      },
      { headers: noStore },
    );
  }

  const params = req.nextUrl.searchParams;
  const prodName = params.get("q") ?? undefined;
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 40, 1), 100);

  try {
    const result = await listProducts(record.accessToken, record.unitCode, { page, limit, prodName });
    return NextResponse.json(
      {
        siteCode,
        unitCode: record.unitCode,
        currency: record.unitCurrency,
        products: result.products,
        totalCount: result.totalCount,
        totalPage: result.totalPage,
        page: result.currentPage,
        priceNote:
          "표시 단가는 할인·쿠폰·회원가·옵션 추가금 반영 전 판매가입니다. 협의 단가로 쓰기 전에 확인하세요.",
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[imweb/products] fetch failed", { siteCode, message: (error as Error).message });
    return NextResponse.json(
      { error: "imweb api error", message: "상품을 불러오지 못했습니다." },
      { status: 502, headers: noStore },
    );
  }
}
