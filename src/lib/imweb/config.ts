/**
 * 아임웹 OpenAPI 접속 설정. 근거: https://developers-docs.imweb.me/reference/openapi.json
 * (2026-09-28 확인). 문서에 있는 경로·scope만 쓴다.
 */
export const API_BASE = process.env.IMWEB_API_BASE ?? "https://openapi.imweb.me";

export const clientId = () => process.env.IMWEB_CLIENT_ID ?? "";
export const clientSecret = () => process.env.IMWEB_CLIENT_SECRET ?? "";
export const redirectUri = () => process.env.IMWEB_REDIRECT_URI ?? "";

/**
 * 최소 권한. site-info:read(사이트/유닛 조회), site-info:write(연동완료·연동해제),
 * product:read(상품·옵션 조회). 회원·주문·결제·리뷰·상품 쓰기 권한은 요청하지 않는다.
 * 개발자센터 앱 > 권한관리에 같은 scope가 선택되어 있어야 설치가 성공한다.
 */
export const DEFAULT_SCOPES = "site-info:read site-info:write product:read";

export const SCOPES =
  (process.env.IMWEB_SCOPES ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(" ") || DEFAULT_SCOPES;

/** 앱 이용권이 유료 결제 연동이 준비됐는지. 미설정이면 무료 플랜으로만 동작한다. */
export const billingConfigured = () =>
  !!(process.env.BILLING_PROVIDER && process.env.BILLING_PLAN_CODE);
