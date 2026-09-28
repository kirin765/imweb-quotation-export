import { NextRequest, NextResponse } from "next/server";
import { saveTokensAfterAuth } from "@/lib/imweb/tokens";
import { startTrialIfNeeded } from "@/lib/billing/service";
import { clearSessionCookie, sessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "imq_oauth";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);

/**
 * OAuth 콜백은 브라우저가 직접 여는 화면이다. 실패해도 raw JSON이 아니라 사람이 읽는 안내를 내보낸다.
 */
function errorPage(title: string, body: string, status = 400): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:64px auto;padding:0 24px;line-height:1.8;color:#222">
<h1 style="font-size:20px;margin-bottom:12px">${title}</h1>
<p style="font-size:15px">${body}</p>
<p style="margin-top:28px;font-size:13px;color:#888">아임웹 관리자 &gt; 앱에서 다시 실행해 주세요.</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (oauthError) {
    console.error("[auth/callback] oauth error", { error: oauthError, description: errorDescription });
    const isScope = /scope/i.test(`${oauthError} ${errorDescription ?? ""}`);
    return errorPage(
      "앱 설치를 진행할 수 없습니다",
      isScope
        ? "아임웹이 인증을 거부했습니다. 이 앱이 요청한 권한(site-info:read, site-info:write, product:read)이 " +
          "개발자센터 <strong>앱 권한관리</strong>에 선택되어 있는지 확인해 주세요."
        : `아임웹이 인증을 거부했습니다.<br><span style="color:#888">(${escapeHtml(
            errorDescription ?? oauthError,
          )})</span>`,
    );
  }

  const oauthCookie = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!oauthCookie) {
    const res = errorPage(
      "앱 설치를 완료하지 못했습니다",
      "설치를 시작한 브라우저 세션을 찾지 못했습니다. 아임웹 관리자 &gt; 앱에서 다시 실행해 주세요.",
    );
    res.cookies.set(clearSessionCookie());
    return res;
  }
  const [siteCodeHint, issuedState] = oauthCookie.split(".");

  if (!code || !state || !siteCodeHint || state !== issuedState) {
    return errorPage(
      "앱 설치를 완료하지 못했습니다",
      "보안 검증(state)이 일치하지 않아 요청을 거부했습니다. 아임웹 관리자 &gt; 앱에서 다시 실행해 주세요.",
    );
  }

  try {
    const record = await saveTokensAfterAuth(siteCodeHint, code);
    // 유료 결제 연동이 준비된 배포에서만 체험 기간을 만든다(없으면 무료 플랜).
    await startTrialIfNeeded(record.siteCode).catch(() => undefined);
    const res = NextResponse.redirect(new URL("/quotes", req.url));
    res.cookies.set(sessionCookie(record.siteCode));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (error) {
    console.error("[auth/callback] token exchange failed", {
      message: (error as Error).message,
    });
    return errorPage(
      "앱 설치를 완료하지 못했습니다",
      `토큰 교환 또는 연동완료 처리에 실패했습니다.<br><span style="color:#888">(${escapeHtml(
        (error as Error).message.slice(0, 200),
      )})</span>`,
      502,
    );
  }
}
