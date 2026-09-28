# 배포 절차

새 프로젝트에 새 DB·시크릿·앱 자격증명을 씁니다. 기존 리뷰 앱 등록이나 배포 식별자를 덮어쓰지 않습니다.

## 1. 개발자센터 앱 등록

1. 아임웹 개발자센터에서 **새 앱**을 만듭니다. 앱명은 스토어 문안과 맞춥니다.
2. 서비스 URL: `https://<host>/` (여기에 `?siteCode=`가 붙어 열립니다).
3. redirect URI: `https://<host>/api/auth/callback`.
4. 권한관리에서 `site-info:read`, `site-info:write`, `product:read`만 선택합니다.
   심사 중에는 API 설정을 수정할 수 없으므로 최소권한을 먼저 확정합니다.
5. 발급받은 Client ID/Secret을 서버 환경변수로만 둡니다.

## 2. 환경변수

`.env.example` 참고. 최소 필수:

| 키 | 설명 |
|---|---|
| `IMWEB_CLIENT_ID` / `IMWEB_CLIENT_SECRET` | 개발자센터 발급값 |
| `IMWEB_REDIRECT_URI` | 위 redirect URI와 정확히 일치 |
| `IMWEB_SESSION_SECRET` | 세션 쿠키 서명 키(32바이트 이상) |
| `DATABASE_URL` | 운영 Postgres. 없으면 메모리(운영 금지) |

이용권·웹훅(선택): `BILLING_PROVIDER`, `BILLING_WEBHOOK_SECRET`, `BILLING_PLAN_CODE`,
`BILLING_PRICE_KRW`, `BILLING_TRIAL_DAYS`, `BILLING_CHECKOUT_URL`, `BILLING_REVENUE_SHARE_RATE`,
`SETTLEMENT_EXPORT_TOKEN`, `IMWEB_WEBHOOK_SECRET`.

## 3. DB

- 앱 전용 스키마를 씁니다. 앱 부팅 시 `ensureSchema()`가 동일 표를 보장하되, 사전 프로비저닝은
  [`db/migrations/001_init.sql`](../db/migrations/001_init.sql)로 합니다.
- 최소 권한 계정으로 전용 데이터베이스를 만들고, 다른 앱과 스키마·계정을 공유하지 않습니다.
- 마이그레이션은 이 앱 디렉터리에만 두고, 다른 제품 repo로 복사하지 않습니다.

## 4. 배포와 확인

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

배포 후 확인:

1. `GET /` → 소개 화면.
2. 유효한 소유 테스트사이트에서 `GET /?siteCode=...` → 승인 → `/quotes`.
3. `GET /api/auth/session` → `installed: true`, `unitCurrency: "KRW"`.
4. 실제 상품 3개로 견적 → XLSX/인쇄.

## 5. 배포 시 주의

- `secure` 쿠키를 쓰므로 HTTPS가 필요합니다.
- 서버리스에서 토큰 갱신이 겹치면 compare-and-set으로 한 번만 반영합니다.
- `DATABASE_URL` 미설정 배포는 토큰이 인스턴스마다 갈라지므로 허용하지 않습니다.
