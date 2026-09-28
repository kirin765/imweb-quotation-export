# 앱 이용권·정산

## 현재 상태(합의 전)

09-14 아임웹 제휴 메일은 제휴사가 고객 결제를 받고 아임웹에 수익쉐어를 지급하는 방식을 제안했습니다.
첨부 계약 초안은 **리뷰이사·스마트스토어 구매평 이관**을 대상으로 하므로, 견적 앱용 별도 계약/부속합의
또는 서비스 범위 수정이 필요한지 담당자에게 확인해야 합니다.

- 수익쉐어: 이메일 20% 제안, 계약 제7조는 `[00]%`·VAT 별도 → 정확한 비율·기준금액·VAT·대상·환불/할인
  반영은 미확정.
- 요금·체험: 리뷰 계약 별첨의 월 9,900원 VAT 별도·14일 무료는 **견적 앱 값으로 채택하지 않습니다.**
- 결제 수취: 제휴사 수취 전제 → PG 계정·지원 기능·수수료 확인 필요.
- 정산 대상: 메일은 ‘아임웹 유입 신규 고객’, 계약은 ‘아임웹 경유 서비스 이용자’ → 귀속 기록 필요.

**미확정 상태에서는 유료 업그레이드 버튼을 노출하지 않습니다.** `BILLING_PROVIDER`/`BILLING_PLAN_CODE`가
없으면 무료 플랜으로 동작합니다.

## 구현된 안전장치

- 결제 확정은 `/api/billing/events`의 HMAC 서명 검증(`BILLING_WEBHOOK_SECRET`)으로만 합니다.
  브라우저 성공 URL만으로 유료 처리하지 않습니다.
- `(provider, event_id)` 유니크 인덱스로 중복 이벤트를 한 번만 반영합니다.
- `payment.failed` → `past_due`, `subscription.cancelled` → 해지(다음 회차 청구 중단),
  `refund.succeeded` → 정산 자료에만 반영.
- 연동 해제 시 `cancelSubscription`이 구독을 내려 청구가 이어지지 않게 합니다.

## 월별 정산 자료

`GET /api/billing/settlement?month=YYYY-MM` (헤더 `Authorization: Bearer $SETTLEMENT_EXPORT_TOKEN`).
`SETTLEMENT_EXPORT_TOKEN` 미설정 시 비활성(503). 산출물은 CSV이며 다음을 분리합니다:

site_code · transaction_id · event_type · occurred_at · attribution · supply_amount · vat · total ·
refund_amount · discount_amount · proposed_share_rate · proposed_share_amount · status.

- `proposed_share_rate`는 `BILLING_REVENUE_SHARE_RATE`가 있을 때만 채웁니다. 없으면 비웁니다.
- VAT는 공급가액의 10%로 **가정**해 표시하며, 실제 세금계산서 기준에 맞춰 확정합니다.
- PG 수수료 공제, 환불 차감월, 할인 반영 방식은 합의되지 않아 임의로 적용하지 않습니다.
- 모든 행은 `status: preview`입니다. 서명된 계약 문안이 확정되면 같은 계산을 확정값으로 다시 산출합니다.

## 계약 제7조 월별 일정(초안)

1. 매월 1일~말일 이용·결제 내역 집계.
2. 익월 5일까지 이용/결제 내역서 제공(휴일이면 다음 영업일).
3. 아임웹이 익월 10일까지 정산금 세금계산서 발행(휴일이면 다음 영업일).
4. 세금계산서 발행월 25일까지 지급(휴일이면 직전 영업일).
5. 차이는 상호 협의 후 익월 반영. 10일까지 이의제기 없으면 동의로 보는 문구는 담당자와 확인합니다.

금액 예시·세금 처리는 실제 서명 문구를 기준으로 확정하며, ‘매출의 80%가 순소득’ 같은 표현을 쓰지
않습니다.
