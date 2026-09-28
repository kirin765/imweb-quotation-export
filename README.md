# imweb-quotation-export

아임웹 상품·옵션을 선택하고 수량·협의 단가를 입력해, 거래처 결재용 견적을 **XLSX**와 **A4 인쇄/PDF**로
만드는 운영자용 앱입니다. 주문 생성·결제·재고·회원/주문 개인정보 조회는 하지 않습니다.

계획과 배경은 [`plan.md`](./plan.md), 실제 검증 기록은 [`QA.md`](./QA.md)를 보세요.
Cafe24 버전(`../cafe24-quotation-export`)의 플랫폼 독립 로직을 이식하고, 아임웹 OpenAPI 연동·tenant
격리·앱 이용권을 새로 붙였습니다.

## 스택

- TypeScript + Next.js 16.3.6(App Router) + React 19
- Postgres(`postgres` 드라이버). `DATABASE_URL`이 없으면 토큰·이용권은 메모리 저장소로 떨어집니다(로컬 전용).
- XLSX 쓰기는 `xlsx`(SheetJS) **0.20.3**(공식 CDN 배포본). npm 레지스트리 0.18.5는 고친 버전이 없어
  0.20.3으로 올렸고, 외부 파일 읽기는 첫 시트만 직접 파싱합니다(`xlsx-read.ts`).
- 테스트: vitest. 린트: eslint(`eslint-config-next`). `npm audit` 0건.

## 빠른 시작

```bash
mise install         # mise.toml에 고정한 Node
npm install          # .npmrc의 legacy-peer-deps 사용
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm test
npm run build
```

환경변수는 [`.env.example`](./.env.example)를 복사해 채웁니다. 아임웹 앱 자격증명·세션 시크릿·
`DATABASE_URL`은 커밋하지 않습니다.

## 구조

```text
src/app/                    목록·편집·인쇄·설정·데모·정책·HTTP 라우트
src/features/quotes/        플랫폼 독립 문서/계산/CSV/XLSX/인쇄 로직
src/lib/imweb/              OAuth·API client·상품/옵션 adapter·토큰 저장소·연동 해제
src/lib/auth/               세션 쿠키·tenant(siteCode+unitCode)
src/lib/billing/            앱 이용권·결제 이벤트·월정산 자료
src/fixtures/               합성 상품·견적
db/migrations/              앱 전용 스키마
store-assets/               심사·스토어용 샘플·문안
docs/                       배포·운영·심사·정산 절차
QA.md                       실제 검증 기록
```

## 아임웹 연동 요약

근거: [공식 OpenAPI](https://developers-docs.imweb.me/reference/openapi.json), [앱 연동 가이드](https://developers-docs.imweb.me/guide/앱-연동하기)
(2026-09-28 확인).

- 최소 권한: `site-info:read`, `site-info:write`, `product:read`. 리뷰·회원·주문·상품 쓰기 권한은 요청하지 않습니다.
- 설치: `/`가 `?siteCode=`를 받아 `/api/auth/launch` → `/oauth2/authorize` → `/api/auth/callback`.
- 콜백에서 토큰 교환 → `PATCH /site-info/integration-complete` → `GET /site-info`로 **검증된** `siteCode`와
  `unitList`를 확보합니다. 설치 시 넘어온 `siteCode`는 힌트일 뿐이며, 검증값과 다르면 거부합니다.
- 상품: `GET /products`(목록·검색), `/products/{prodNo}`(단건), `/products/{prodNo}/options`(옵션 정의),
  `/products/{prodNo}/option-details`(실제 옵션 조합). 옵션 정의를 임의로 곱하지 않습니다.
- 판매가는 할인·쿠폰·회원가 반영 전 값이라 **협의 단가의 제안값**으로만 씁니다.
- 연동 해제: 앱 안의 `/api/auth/uninstall`이 `PATCH /site-info/integration-cancellation` 호출 → 토큰 삭제 →
  이용권 청구 중단. 삭제 웹훅을 기다리는 설계로 끝내지 않습니다.

## 안전장치

- 모든 문서 조회에 `site_code` 조건을 걸어 다른 사이트 접근을 404로 감춥니다.
- 동시 편집은 revision 낙관적 잠금으로 충돌을 감지합니다.
- 확정본은 스냅샷이며 설정·카탈로그 변경이 소급되지 않습니다.
- 로그에는 이벤트·건수·상태만 남기고 토큰·문서 본문·수신처를 넣지 않습니다.
- 결제는 서버 웹훅의 HMAC 서명 검증으로만 확정하고, `(provider, event_id)` 유니크로 중복을 막습니다.
