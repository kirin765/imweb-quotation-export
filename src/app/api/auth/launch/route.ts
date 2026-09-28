import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/imweb/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "imq_oauth";
const OAUTH_TTL_S = 600; // 10분 — 인가 요청→콜백 왕복에 충분

/**
 * 아임웹 설치 진입. 서비스 URL이 `?siteCode=...`로 열리면 여기서 OAuth2 authorize로 넘긴다.
 * 이 siteCode는 설치 힌트일 뿐이며, 콜백에서 site-info로 검증한 값만 세션에 넣는다.
 * state는 CSRF 방지용으로 발급해 httpOnly 쿠키에 묶어 둔다.
 */
export async function GET(req: NextRequest) {
  const siteCode = req.nextUrl.searchParams.get("siteCode");
  if (!siteCode) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(siteCode, state));
  res.cookies.set(OAUTH_COOKIE, `${siteCode}.${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: OAUTH_TTL_S,
    path: "/",
  });
  return res;
}
