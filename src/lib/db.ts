import postgres from "postgres";

let client: postgres.Sql | null = null;

/**
 * 서버 전용 Postgres 클라이언트. 서버리스에서 연결이 불어나지 않도록 max=1로 두고
 * 인스턴스마다 재사용한다. DATABASE_URL이 없으면 null을 돌려주고 호출부가 안내한다.
 */
export function db(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  client ??= postgres(url, { max: 1 });
  return client;
}

export const hasDatabase = () => !!process.env.DATABASE_URL;
