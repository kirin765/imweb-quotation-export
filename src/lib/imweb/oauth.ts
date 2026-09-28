import { API_BASE, SCOPES, clientId, clientSecret, redirectUri } from "./config";

/** status를 실어 던지는 API 오류 — 호출부가 401/429/5xx를 구분해 재시도/재설치를 판단한다. */
export type ImwebApiError = Error & { status?: number };

export async function apiError(label: string, res: Response): Promise<ImwebApiError> {
  const body = await res.text().catch(() => "");
  const error = new Error(`imweb ${label} ${res.status}: ${body.slice(0, 300)}`) as ImwebApiError;
  error.status = res.status;
  return error;
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  scope: string;
};

/** 아임웹 인가 코드 발급 URL. siteCode는 설치 시 서비스 URL로 넘어온 값(설치 힌트). */
export function authorizeUrl(siteCode: string, state: string): string {
  const query = new URLSearchParams({
    responseType: "code",
    clientId: clientId(),
    redirectUri: redirectUri(),
    scope: SCOPES,
    state,
    siteCode,
  });
  return `${API_BASE}/oauth2/authorize?${query}`;
}

/**
 * 토큰 발급/재발급. 아임웹은 이 엔드포인트를 **application/x-www-form-urlencoded**로만 받는다
 * (JSON으로 보내면 errorCode 30122로 거부됨 — 2026-09-28 실측). Authorization은 Basic(clientId:clientSecret)을
 * 쓰고, 본문에도 clientId/clientSecret을 함께 실어 보낸다(공식 TokenRequestDto 요구).
 */
async function tokenCall(body: Record<string, string>, label: string): Promise<TokenPair> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    // 토큰 교환도 응답이 없으면 무한 대기하지 않게 끊는다.
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw await apiError(label, res);
  }
  const payload = (await res.json()) as { data?: Partial<TokenPair> } & Partial<TokenPair>;
  const data = payload.data ?? payload;
  if (!data.accessToken || !data.refreshToken) {
    throw new Error(`imweb ${label}: accessToken/refreshToken이 응답에 없습니다.`);
  }
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    scope: data.scope ?? "",
  };
}

export function exchangeCode(code: string): Promise<TokenPair> {
  return tokenCall(
    {
      grantType: "authorization_code",
      clientId: clientId(),
      clientSecret: clientSecret(),
      redirectUri: redirectUri(),
      code,
    },
    "token",
  );
}

export function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  return tokenCall(
    {
      grantType: "refresh_token",
      clientId: clientId(),
      clientSecret: clientSecret(),
      refreshToken,
    },
    "token-refresh",
  );
}
