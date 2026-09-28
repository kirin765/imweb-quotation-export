export const metadata = {
  title: "개인정보처리방침 — 아임웹 견적서",
  description: "수집 항목, 이용 목적, 보관·파기를 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-7">
      <h1 className="text-lg font-bold">개인정보처리방침</h1>
      <p className="mt-1 text-xs text-neutral-500">최종 수정 2026-09-28</p>

      <h2 className="mt-6 font-semibold">1. 수집하는 정보</h2>
      <ul className="mt-1 list-disc pl-5">
        <li>
          아임웹 사이트 식별자(<code>siteCode</code>)와 선택한 유닛(<code>unitCode</code>), 접근·갱신
          토큰
        </li>
        <li>
          이용자가 앱에서 입력한 견적 내용: <b>수신 회사명</b>, 유효기한, 납기·배송 조건, 가격 조건,
          비고, 품목(상품명·옵션·수량·단가), 조정 금액, 공급자 표시 정보
        </li>
        <li>
          아임웹 상품 API에서 조회한 <b>상품명·상품 코드·판매가·옵션명</b>
        </li>
        <li>앱 동작 기록(문서 확정·복제·내보내기 같은 사건과 시각, 버전·건수·총액)</li>
        <li>앱 이용권 결제 시 거래 식별자·결제 상태(이용권 기능을 쓰는 경우)</li>
      </ul>

      <h2 className="mt-6 font-semibold">2. 수집하지 않는 정보</h2>
      <p>
        구매자·회원의 실명, 연락처, 주소, 이메일은 수집하지 않습니다. 회원·주문·결제 권한을 요청하지
        않으며 해당 API를 호출하지 않습니다. 이력에는 수신처 회사명과 품목 본문을 남기지 않습니다.
      </p>

      <h2 className="mt-6 font-semibold">3. 이용 목적</h2>
      <p>
        이용자 본인의 사이트 상품을 골라 견적서를 작성하고, 같은 내용을 XLSX 파일과 인쇄용 PDF(A4)로
        내보내는 목적으로만 사용합니다. 다른 목적으로 사용하거나 광고에 쓰지 않습니다.
      </p>

      <h2 className="mt-6 font-semibold">4. 보관 및 파기</h2>
      <ul className="mt-1 list-disc pl-5">
        <li>연동 토큰은 앱에서 연동을 해제하면 지체 없이 삭제합니다.</li>
        <li>토큰은 접근 토큰(2시간)과 갱신 토큰이며, 만료 전 자동 갱신합니다.</li>
        <li>
          견적 초안과 확정본은 이용자가 삭제하거나 삭제를 요청할 때까지 보관합니다. 연동 해제만으로는
          문서가 지워지지 않으며, 삭제 요청 시 파기합니다.
        </li>
        <li>법정 보존이 필요한 결제 증빙은 해당 법령이 정한 기간과 방법에 따릅니다.</li>
      </ul>

      <h2 className="mt-6 font-semibold">5. 보관 위치와 처리 위탁</h2>
      <p>
        데이터는 앱 운영을 위해 사용하는 클라우드와 관리형 데이터베이스에 암호화된 연결로
        저장됩니다. 결제를 도입하는 경우 결제 처리 업체에 결제 정보 처리를 위탁할 수 있으며, 위탁
        사실과 범위를 이 방침에 반영합니다. 그 외 제3자에게 제공하지 않습니다.
      </p>

      <h2 className="mt-6 font-semibold">6. 이용자의 권리</h2>
      <p>
        앱에서 언제든 견적을 삭제할 수 있고, 앱의 연동 해제로 저장된 토큰을 제거할 수 있습니다. 보관
        중인 데이터의 열람·삭제를 요청할 수 있습니다.
      </p>

      <h2 className="mt-6 font-semibold">7. 문의</h2>
      <p>kwan765@naver.com</p>
    </main>
  );
}
