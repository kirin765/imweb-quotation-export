import postgres from "postgres";

/**
 * 설치된 사이트의 OAuth 토큰 레코드. tenant 식별자는 검증된 siteCode다.
 * unitCode는 site-info 응답에서 고른 KRW 유닛이며, 청구·정산의 귀속 기준으로도 쓴다.
 */
export type TokenRecord = {
  siteCode: string;
  unitCode: string;
  unitCurrency: string;
  siteName: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: string;
};

export interface TokenStore {
  kind: "postgres" | "memory";
  get(siteCode: string): Promise<TokenRecord | null>;
  put(record: TokenRecord): Promise<void>;
  /**
   * 내가 읽은 refresh_token이 아직 그대로일 때만 교체한다(compare-and-set).
   * 다른 인스턴스가 먼저 갱신했다면 false를 돌려주고 호출부는 저장소 값을 다시 읽는다.
   */
  rotate(record: TokenRecord, expectedRefreshToken: string): Promise<boolean>;
  /** 연동해제·만료 시 토큰을 지운다. 지우지 않으면 재설치가 막힌다. */
  delete(siteCode: string): Promise<void>;
}

const memory = new Map<string, TokenRecord>();

const memoryStore: TokenStore = {
  kind: "memory",
  async get(siteCode) {
    return memory.get(siteCode) ?? null;
  },
  async put(record) {
    memory.set(record.siteCode, record);
  },
  async rotate(record, expectedRefreshToken) {
    const current = memory.get(record.siteCode);
    if (!current || current.refreshToken !== expectedRefreshToken) {
      return false;
    }
    memory.set(record.siteCode, record);
    return true;
  },
  async delete(siteCode) {
    memory.delete(siteCode);
  },
};

function pgStore(url: string): TokenStore {
  const sql = postgres(url, { max: 1 });
  let ready: Promise<void> | null = null;
  const init = () =>
    (ready ??= sql`
      create table if not exists imq_tokens (
        site_code text primary key,
        unit_code text not null default '',
        unit_currency text not null default 'KRW',
        site_name text not null default '',
        access_token text not null,
        refresh_token text not null,
        scope text not null default '',
        expires_at timestamptz not null,
        updated_at timestamptz not null default now()
      )`.then(() => undefined));

  return {
    kind: "postgres",
    async get(siteCode) {
      await init();
      const [row] = await sql<
        {
          site_code: string;
          unit_code: string;
          unit_currency: string;
          site_name: string;
          access_token: string;
          refresh_token: string;
          scope: string;
          expires_at: Date;
        }[]
      >`select site_code, unit_code, unit_currency, site_name, access_token, refresh_token, scope, expires_at
        from imq_tokens where site_code = ${siteCode}`;
      if (!row) {
        return null;
      }
      return {
        siteCode: row.site_code,
        unitCode: row.unit_code,
        unitCurrency: row.unit_currency,
        siteName: row.site_name,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        scope: row.scope,
        expiresAt: row.expires_at.toISOString(),
      };
    },
    async put(record) {
      await init();
      await sql`
        insert into imq_tokens
          (site_code, unit_code, unit_currency, site_name, access_token, refresh_token, scope, expires_at)
        values (${record.siteCode}, ${record.unitCode}, ${record.unitCurrency}, ${record.siteName},
                ${record.accessToken}, ${record.refreshToken}, ${record.scope}, ${record.expiresAt})
        on conflict (site_code) do update set
          unit_code = excluded.unit_code,
          unit_currency = excluded.unit_currency,
          site_name = excluded.site_name,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          scope = excluded.scope,
          expires_at = excluded.expires_at,
          updated_at = now()`;
    },
    async rotate(record, expectedRefreshToken) {
      await init();
      const rows = await sql`
        update imq_tokens set
          access_token = ${record.accessToken},
          refresh_token = ${record.refreshToken},
          scope = ${record.scope},
          expires_at = ${record.expiresAt},
          updated_at = now()
        where site_code = ${record.siteCode} and refresh_token = ${expectedRefreshToken}
        returning site_code`;
      return rows.length > 0;
    },
    async delete(siteCode) {
      await init();
      await sql`delete from imq_tokens where site_code = ${siteCode}`;
    },
  };
}

export const tokenStore: TokenStore = process.env.DATABASE_URL
  ? pgStore(process.env.DATABASE_URL)
  : memoryStore;

/** DATABASE_URL이 있으면 토큰 저장소를 쓸 수 있다. 없으면 메모리(로컬 전용)로 동작한다. */
export const tokenStoreKind = () => tokenStore.kind;
