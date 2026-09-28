import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { tokenStore } from "@/lib/imweb/token-store";

export const SESSION_COOKIE = "imq_sess";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 — 관리자 화면 재접속을 넉넉히 허용

const secret = () => process.env.IMWEB_SESSION_SECRET ?? "dev-only-session-secret-change-me";

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type Session = { siteCode: string };

export function issueSession(siteCode: string): string {
  const payload = Buffer.from(
    JSON.stringify({ siteCode, exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function sessionCookie(siteCode: string) {
  return {
    name: SESSION_COOKIE,
    value: issueSession(siteCode),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: 0,
  };
}

/** 세션 쿠키를 검증해 siteCode를 돌려준다. 쿼리의 siteCode는 믿지 않는다. */
export function sessionFromValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const cut = value.lastIndexOf(".");
  if (cut <= 0) {
    return null;
  }
  const payload = value.slice(0, cut);
  if (!safeEqual(value.slice(cut + 1), sign(payload))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      siteCode?: string;
      exp?: number;
    };
    if (!data.siteCode || Number(data.exp) < Date.now()) {
      return null;
    }
    return data.siteCode;
  } catch {
    return null;
  }
}

/** 라우트 핸들러용. 설치 세션의 사이트 코드만 신뢰한다. */
export function sessionSite(req: NextRequest): string | null {
  return sessionFromValue(req.cookies.get(SESSION_COOKIE)?.value);
}

/** 서버 컴포넌트용. */
export async function currentSiteCode(): Promise<string | null> {
  const jar = await cookies();
  return sessionFromValue(jar.get(SESSION_COOKIE)?.value);
}

export type Tenant = {
  siteCode: string;
  unitCode: string;
  unitCurrency: string;
  siteName: string;
};

/**
 * 세션의 siteCode와 저장된 토큰의 unitCode를 묶어 tenant를 만든다.
 * unitCode는 site-info 검증 후 저장된 값이며, 클라이언트가 보낸 값을 쓰지 않는다.
 */
export async function currentTenant(): Promise<Tenant | null> {
  const siteCode = await currentSiteCode();
  if (!siteCode) {
    return null;
  }
  const record = await tokenStore.get(siteCode);
  if (!record) {
    return null;
  }
  return {
    siteCode,
    unitCode: record.unitCode,
    unitCurrency: record.unitCurrency,
    siteName: record.siteName,
  };
}
