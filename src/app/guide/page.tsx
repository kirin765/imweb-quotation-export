export const metadata = {
  title: "사용 가이드 — 아임웹 견적서",
  description: "설치부터 첫 견적, 확정, 내보내기, 연동 해제까지.",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "1. 설치와 연동",
    body: "아임웹 관리자 > 앱에서 이 앱을 실행하면 서비스 URL로 siteCode가 전달됩니다. 권한 승인 화면에서 site-info:read, site-info:write, product:read만 요청합니다. 승인하면 견적 목록으로 이동합니다.",
  },
  {
    title: "2. 상품 불러오기",
    body: "상품명으로 검색해 체크하고 '선택 N개 견적에 추가'를 누르면 실제 옵션 조합이 행으로 들어옵니다. 표시 단가는 할인·쿠폰·회원가 반영 전 판매가이므로 협의 단가로 고쳐 쓰세요. KRW가 아닌 유닛은 불러오지 않고 안내합니다.",
  },
  {
    title: "3. 문서 정보와 품목 편집",
    body: "수신 회사명은 필수입니다. 유효기한·납기/배송 조건·가격 조건·비고를 입력하고, 품목의 수량·단가를 확정합니다. 계산은 원 단위 정수이며, 조정 금액에는 설명이 필요합니다.",
  },
  {
    title: "4. 저장과 확정",
    body: "편집이 멈추면 자동 저장됩니다. '확정하고 새 버전 만들기'를 누르면 그 시점 내용이 스냅샷으로 남고 이후 수정은 새 버전으로만 쌓입니다. 설정을 바꿔도 과거 확정본은 바뀌지 않습니다.",
  },
  {
    title: "5. XLSX와 인쇄/PDF",
    body: "같은 문서 데이터로 XLSX를 내려받고, 인쇄 화면에서 브라우저의 'PDF로 저장'을 씁니다. XLSX는 수량·단가를 고쳐도 합계가 자동 재계산되지 않습니다.",
  },
  {
    title: "6. 연동 해제",
    body: "앱의 연동 해제를 누르면 아임웹 연동해제 API 호출, 토큰 삭제, 다음 회차 청구 중단이 함께 처리됩니다. 견적 문서는 삭제되지 않으며, 삭제 요청 시 파기합니다.",
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-7">
      <h1 className="text-lg font-bold">사용 가이드</h1>
      <p className="mt-1 text-xs text-neutral-500">
        설치 없이 화면만 보려면 <a className="underline" href="/demo">데모</a>를 쓰세요.
      </p>

      <ol className="mt-6 space-y-5">
        {STEPS.map((step) => (
          <li key={step.title}>
            <h2 className="font-semibold">{step.title}</h2>
            <p className="mt-1 text-neutral-700">{step.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-8 rounded border border-neutral-300 bg-white p-4">
        <h2 className="text-sm font-bold">자주 묻는 질문</h2>
        <dl className="mt-3 space-y-3 text-neutral-700">
          <div>
            <dt className="font-semibold">PDF 파일을 바로 내려받을 수 있나요?</dt>
            <dd>아니요. 인쇄 전용 화면에서 브라우저의 인쇄/PDF 저장을 씁니다.</dd>
          </div>
          <div>
            <dt className="font-semibold">부가세가 자동 계산되나요?</dt>
            <dd>
              아니요. 가격 조건에 세금 포함 여부를 적어 주세요. 자동 계산은 추가 범위로 다룹니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">상품 단가가 실제 결제 금액인가요?</dt>
            <dd>아니요. 협의 단가의 제안값이며, 운영자가 확정합니다.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
