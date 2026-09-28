import type { NextRequest } from "next/server";
import { currentTenant, sessionSite, type Tenant } from "@/lib/auth/session";
import { tokenStore } from "@/lib/imweb/token-store";

/**
 * 서버 컴포넌트에서 현재 tenant(siteCode+unitCode)를 얻는다. 쿼리 파라미터의 siteCode는 신뢰하지 않는다.
 * 세션이나 저장된 토큰이 없으면 null이며, 호출부는 설치 안내를 보여준다.
 */
export async function currentTenantOrNull(): Promise<Tenant | null> {
  return currentTenant();
}

/**
 * 라우트 핸들러용 tenant. 세션의 siteCode와 저장된 토큰의 unitCode만 쓴다.
 * unitCode는 클라이언트가 보낸 값이 아니라 site-info 검증 후 저장된 값이다.
 */
export async function tenantFromRequest(
  req: NextRequest,
): Promise<{ siteCode: string; unitCode: string } | null> {
  const siteCode = sessionSite(req);
  if (!siteCode) {
    return null;
  }
  const record = await tokenStore.get(siteCode);
  return { siteCode, unitCode: record?.unitCode ?? "" };
}
