import { exchangeCode, refreshAccessToken } from "./oauth";
import { completeIntegration, getSiteInfo } from "./client";
import { tokenStore, type TokenRecord } from "./token-store";
import type { SiteUnit } from "./client";

/** accessToken 유효시간은 2시간(공식 안내). 만료 5분 전에 미리 갱신한다. */
const ACCESS_TTL_MS = 2 * 60 * 60 * 1000;
const SKEW_MS = 5 * 60 * 1000;

const isFresh = (record: TokenRecord) => Date.parse(record.expiresAt) - Date.now() > SKEW_MS;

/**
 * 여러 유닛 중 견적에 쓸 유닛을 고른다. KRW 유닛이 있으면 그것을, 없으면 첫 유닛을 쓴다.
 * 지원 통화가 KRW가 아니면 화면에서 명확히 안내하고, KRW가 아니어도 저장은 하되 금액 계산은 원 단위 정수다.
 */
export function pickUnit(unitList: readonly SiteUnit[]): SiteUnit | null {
  if (unitList.length === 0) {
    return null;
  }
  return unitList.find((unit) => unit.currency.toUpperCase() === "KRW") ?? unitList[0];
}

/**
 * 설치 콜백에서 호출. code → 토큰 교환 → 연동완료 처리(필수) → site-info 확보.
 * query의 siteCode는 힌트일 뿐이고, 여기서 검증한 응답의 siteCode만 tenant로 쓴다.
 */
export async function saveTokensAfterAuth(siteCodeHint: string, code: string): Promise<TokenRecord> {
  const tokens = await exchangeCode(code);
  await completeIntegration(tokens.accessToken);
  const info = await getSiteInfo(tokens.accessToken);

  if (!info.siteCode) {
    throw new Error("site-info 응답에 siteCode가 없습니다.");
  }
  // 설치 시작 힌트와 검증된 siteCode가 다르면 다른 사이트 데이터를 여는 요청일 수 있으므로 거부한다.
  if (siteCodeHint && info.siteCode.toLowerCase() !== siteCodeHint.toLowerCase()) {
    throw new Error("설치한 사이트와 인증된 사이트 정보가 일치하지 않습니다.");
  }

  const unit = pickUnit(info.unitList);
  const record: TokenRecord = {
    siteCode: info.siteCode,
    unitCode: unit?.unitCode ?? "",
    unitCurrency: unit?.currency ?? "KRW",
    siteName: unit?.name ?? info.siteCode,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
    expiresAt: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
  };
  await tokenStore.put(record);
  return record;
}

/** 같은 인스턴스 안에서 같은 사이트의 갱신이 겹치면 하나만 수행하고 결과를 공유한다. */
const inflight = new Map<string, Promise<TokenRecord | null>>();

/**
 * 저장된 토큰을 꺼내되 만료가 임박하면 갱신해서 돌려준다.
 * 갱신은 저장소의 refresh_token이 아직 같을 때만 반영한다(compare-and-set).
 * 갱신 실패(리프레시 만료·권한 철회)는 재설치가 필요하다는 뜻이라 낡은 토큰을 돌려주지 않는다.
 */
export async function getValidToken(siteCode: string): Promise<TokenRecord | null> {
  const record = await tokenStore.get(siteCode);
  if (!record) {
    return null;
  }
  if (isFresh(record)) {
    return record;
  }

  const running = inflight.get(siteCode);
  if (running) {
    return running;
  }

  const task = (async (): Promise<TokenRecord | null> => {
    try {
      const fresh = await refreshAccessToken(record.refreshToken);
      const next: TokenRecord = {
        ...record,
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        scope: fresh.scope || record.scope,
        expiresAt: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
      };
      if (await tokenStore.rotate(next, record.refreshToken)) {
        return next;
      }
      // 다른 인스턴스가 먼저 갱신했다. 내가 받은 토큰은 버리고 저장소 값을 쓴다.
      return await tokenStore.get(siteCode);
    } catch {
      const latest = await tokenStore.get(siteCode);
      return latest && isFresh(latest) ? latest : null;
    } finally {
      inflight.delete(siteCode);
    }
  })();

  inflight.set(siteCode, task);
  return task;
}

export async function deleteTokens(siteCode: string): Promise<void> {
  await tokenStore.delete(siteCode);
}
