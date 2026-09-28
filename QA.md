# QA — 실제 검증 기록

- 작성일: 2026-09-28
- 대상: 새 프로젝트 이식 + 아임웹 연동 어댑터 + 이용권/정산
- 설치 한도 소모: **없음** (자동 검증은 로컬·합성 데이터만 사용. 실제 아임웹 설치는 미수행)

이 문서는 **실제로 실행한 것**과 **아직 하지 않은 것**을 구분합니다. 합성 데모 성공을 실제 API
실측 성공으로 세지 않습니다.

## 1. 실행 완료

| # | 검사 | 명령 | 결과 |
|---|---|---|---|
| 1 | 타입 검사 | `npx tsc --noEmit` | 통과 (오류 0) |
| 2 | 린트 | `npm run lint` | 통과 (오류 0) |
| 3 | 단위/통합 테스트 | `npm test` | 12 파일 통과, 92 통과 · 12 건너뜀(DB 통합). 합계 104 |
| 4 | 프로덕션 빌드 | `npm run build` | 통과(Next 16.3.6, Turbopack). 라우트 31개 생성 |
| 5 | 의존성 설치 | `npm ci` | 411 패키지 설치(.npmrc `legacy-peer-deps`) |
| 6 | 의존성 취약점 | `npm audit` | **0 vulnerabilities** |
| 7 | 토큰 엔드포인트 실측 | `POST https://openapi.imweb.me/oauth2/token` (더미 code) | 자격증명 유효. **form-urlencoded 필수**(JSON은 errorCode 30122로 거부) → `oauth.ts` 수정 |

### 의존성 보안 결정

- **Next**: 원본이 쓰던 16.2.12는 `npm audit`에서 RCE·postcss·sharp 취약 범위(9.3.4-canary.0~16.3.2)에
  포함되어, 패치 버전 **16.3.6**으로 올렸습니다.
- **xlsx**: npm 레지스트리의 0.18.5에는 고친 버전이 없습니다(prototype pollution·ReDoS). 배포처를
  SheetJS 공식 CDN의 **0.20.3**으로 바꿔 두 취약점을 제거했습니다. 또한 이 앱은 SheetJS로 **쓰기만**
  하고, 외부 파일 읽기는 취약점을 피하려고 첫 시트만 직접 파싱(`xlsx-read.ts`)합니다.

### 테스트 범위(자동)

- 이식한 계산/CSV/XLSX/가져오기: `model.test.ts`, `csv.test.ts`, `xlsx.test.ts`, `xlsx-read.test.ts`,
  `items.test.ts`, `example-files.test.ts` (0원·긴 한글·앞자리0 코드·금액÷수량·BOM·구형 .xls 거부 등).
- 아임웹 어댑터: `client.test.ts` (상품/옵션 매핑, 조합 라벨, 빈 응답 안전).
- 세션: `session.test.ts` (서명, 변조·타 시크릿 거부).
- 이용권: `plans.test.ts` (체험/활성/만료/past_due/무료 판정), `service.test.ts`
  (웹훅 서명 필수, 결제 반영, 중복 이벤트 멱등, 결제 실패, 해지 후 청구 중단).
- 정산: `settlement.test.ts` (공급가/VAT 분리, 비율 미설정 시 금액 비움, 환불 분리, CSV).

### 건너뛴 검사(조건 불충족)

- `repo.integration.test.ts` 12건: `DATABASE_URL` 미설정으로 skip. 실제 Postgres에서 저장·확정·복제·
  tenant 격리를 확인하려면:
  `DATABASE_URL=... npx vitest run src/features/quotes/server/repo.integration.test.ts`

### 런타임 smoke(프로덕션 빌드 + `next start`, 2026-09-28)

| 요청 | 기대 | 결과 |
|---|---|---|
| `GET /` | 200 소개 | 통과 |
| `GET /guide` `/demo` `/demo/print` `/print` `/privacy` `/support` | 200 | 통과 |
| `GET /quotes`(미설치) | 앱 실행 안내 | 통과 |
| `GET /api/auth/session`(미설치) | `installed:false`, scope 3종, `storeKind:memory` | 통과 |
| `GET /api/quotes`(세션 없음) | 401 `session required` | 통과 |
| `GET /api/imweb/products`(세션 없음) | 401 | 통과 |
| `GET /api/auth/launch`(siteCode 없음) | 307 → `/` | 통과 |
| `GET /api/auth/launch?siteCode=...` | 307 → `https://openapi.imweb.me/oauth2/authorize` (responseType·scope·state·siteCode 포함) | 통과 |
| `GET /api/auth/callback`(쿠키 없음) | 400 + HTML 안내 | 통과 |
| `POST /api/billing/events`(서명 없음) | 401 `invalid signature` | 통과 |
| `GET /api/billing/settlement`(토큰 미설정) | 503 비활성 | 통과 |
| `GET /api/billing/status`(세션 없음) | 401 | 통과 |

## 2. 아직 하지 않은 것 (다음 단계)

계획의 Phase A 실측과 Phase D 제출 전 확인에 해당합니다. **통과로 표시하지 않습니다.**

- 실제 아임웹 테스트사이트 설치(`/api/auth/launch` → 승인 → `/api/auth/callback`). 토큰 엔드포인트의
  자격증명 수락과 form-urlencoded 요구는 실측으로 확인했으나(위 7번), 실제 승인 코드 교환은
  개발자센터에 등록한 redirect URI와 유효한 테스트사이트가 있어야 완결됩니다.
- 실제 `GET /site-info`, `/products`, `/products/{prodNo}/options`, `/option-details` 응답 대조.
  현재 adapter 매핑은 공식 OpenAPI(2026-09-28 확인) 스키마를 근거로 작성했으며 실제 응답 fixture로
  재검증해야 합니다.
- KRW가 아닌 유닛, 판매중지·삭제 상품, 옵션 조합 다수, 페이지네이션 실측.
- 실 브라우저 흐름: 설치 → 첫 견적 → 저장 → 재접속 → 확정 → XLSX 재열기 → 인쇄 PDF(한글 폰트·페이지 나눔).
- `/api/auth/uninstall`의 실제 `integration-cancellation` 호출과 토큰 삭제.
- 결제 웹훅 실 PG 연동, 성공/실패/중복/환불, 해제 후 청구 중단 실측.
- 심사용 스토어 자산 규격(콘텐츠 가이드 접근 실패로 미확인).

## 3. 이번 구현에서 확인한 사실과 한계

- 아임웹 OpenAPI 응답의 `data`는 목록 API에서 **페이지 객체의 배열**입니다. 어댑터는 `list`가 있는
  페이지를 찾아 씁니다(`firstPage`).
- 상품 판매가(`price`)는 할인·쿠폰·회원가 반영 전 값이라 협의 단가의 제안값으로만 표시합니다.
- 옵션은 정의를 곱하지 않고 실제 `option-details` 조합을 행으로 씁니다. 조합이 50개를 넘으면 잘라내고
  사용자에게 알립니다.
- 결제는 제공자 미확정 상태에서 유료 처리를 하지 않습니다(`BILLING_PROVIDER`/`BILLING_PLAN_CODE` 없으면
  무료 플랜, 업그레이드 버튼 숨김).
- 정산 자료는 합의 전이므로 `preview`이며, PG 수수료·환불 차감월·할인 반영을 임의로 적용하지 않습니다.
