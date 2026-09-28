export const metadata = {
  title: "지원·이용약관·환불 안내 — 아임웹 견적서",
  description: "지원 창구, 이용 조건, 환불 기준을 안내합니다.",
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-7">
      <h1 className="text-lg font-bold">지원·이용약관·환불 안내</h1>
      <p className="mt-1 text-xs text-neutral-500">
        최종 수정 2026-09-28 · 운영: 봇메이커(Giwan)
      </p>

      <h2 className="mt-6 font-semibold">1. 지원</h2>
      <p>
        문의: <b>kwan765@naver.com</b>. 영업일 기준 2일 안에 답변을 목표로 합니다. 오류 신고 시
        사이트 코드(<code>siteCode</code>), 발생 시각, 화면 이름, 재현 절차를 적어 주시면 빠릅니다.
        토큰·문서 본문·수신처 정보는 메일로 보내지 마세요.
      </p>

      <h2 className="mt-6 font-semibold">2. 서비스 내용</h2>
      <ul className="mt-1 list-disc pl-5">
        <li>아임웹 상품·옵션을 골라 견적서를 작성·저장·확정하고 XLSX·인쇄(PDF)로 내보내는 기능</li>
        <li>주문 생성·결제·재고·회원/주문 개인정보 조회는 제공하지 않습니다.</li>
        <li>견적서는 주문 전 제안이며 결제 완료나 주문 생성을 의미하지 않습니다.</li>
      </ul>

      <h2 className="mt-6 font-semibold">3. 이용 조건</h2>
      <ul className="mt-1 list-disc pl-5">
        <li>이용자는 본인 소유 또는 관리 권한이 있는 아임웹 사이트에서만 앱을 사용할 수 있습니다.</li>
        <li>요금·체험 기간·청구 주기는 앱 화면의 이용권 안내를 따릅니다.</li>
        <li>요금 변경은 사전에 앱 화면과 안내로 알리고, 청구 전에 반영합니다.</li>
      </ul>

      <h2 className="mt-6 font-semibold">4. 환불 기준</h2>
      <ul className="mt-1 list-disc pl-5">
        <li>결제 후 7일 이내에 서비스를 이용하지 않았다면 전액 환불합니다.</li>
        <li>이미 사용한 기간은 환불 대상에서 제외하며, 남은 기간에 대해 일할 계산해 환불합니다.</li>
        <li>앱 오류로 서비스를 쓰지 못한 경우 확인 후 기간 연장 또는 환불로 처리합니다.</li>
        <li>환불은 결제 수단을 통해 처리하며 처리에 영업일이 걸릴 수 있습니다.</li>
      </ul>

      <h2 className="mt-6 font-semibold">5. 데이터 삭제</h2>
      <p>
        앱에서 견적을 삭제할 수 있고, 연동 해제로 토큰을 제거할 수 있습니다. 문서 전체 삭제가
        필요하면 위 이메일로 요청해 주세요. 결제 증빙은 법령이 정한 기간 동안 보관될 수 있습니다.
      </p>

      <h2 className="mt-6 font-semibold">6. 연동 해제</h2>
      <p>
        아임웹 관리자에는 앱 해제 기능이 없어, 앱 안의 <b>연동 해제</b>를 사용합니다. 해제하면 접근
        토큰이 삭제되고 다음 회차 청구가 중단됩니다.
      </p>
    </main>
  );
}
