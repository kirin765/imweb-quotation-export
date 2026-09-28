import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 서비스 URL. 아임웹이 설치 시 `?siteCode=...`를 붙여 이 경로를 연다.
 * siteCode가 있으면 설치(OAuth) 흐름으로 넘기고, 없으면 소개 화면을 보여준다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ siteCode?: string }>;
}) {
  const { siteCode } = await searchParams;
  if (siteCode) {
    redirect(`/api/auth/launch?siteCode=${encodeURIComponent(siteCode)}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold tracking-widest text-neutral-500">IMWEB B2B</p>
      <h1 className="mt-2 text-2xl font-bold">견적서 자동 작성</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-700">
        아임웹에 등록한 상품·옵션을 불러와 수량과 <b>협의 단가</b>를 입력하고, 거래처 결재용
        견적서를 XLSX와 A4 인쇄/PDF로 만듭니다. 견적은 주문 전 제안이며 결제·주문을 만들지 않습니다.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          href="/demo"
        >
          설치 없이 데모 보기
        </a>
        <a
          className="rounded border border-neutral-400 bg-white px-4 py-2 text-sm font-semibold"
          href="/guide"
        >
          사용 가이드
        </a>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-bold">사용 흐름</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>아임웹 관리자 &gt; 앱에서 이 앱을 실행하고 사이트 연동을 승인합니다.</li>
          <li>KRW 유닛의 상품·옵션을 검색해 견적에 추가합니다.</li>
          <li>수량·협의 단가, 수신 회사명, 유효기한, 납기/가격 조건, 비고를 입력합니다.</li>
          <li>초안을 저장하고 필요하면 확정해 버전을 남깁니다.</li>
          <li>같은 확정본으로 XLSX를 내려받고 인쇄 화면에서 PDF로 저장합니다.</li>
        </ol>
      </section>

      <section className="mt-8 rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-bold text-amber-900">이 앱이 하지 않는 것</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
          <li>주문 생성·수정, 장바구니, 결제 링크, 재고 예약</li>
          <li>회원·주문 개인정보 조회, 자동 발송, 전자서명</li>
          <li>부가세 자동 계산, 세금계산서 발행, 외화·다국어</li>
          <li>버튼 하나로 PDF 파일을 직접 만드는 기능(브라우저 인쇄 저장만 지원)</li>
        </ul>
        <p className="mt-3 text-xs text-amber-900">
          견적서는 주문 전 제안이며 결제 완료나 주문 생성으로 표시하지 않습니다.
        </p>
      </section>

      <p className="mt-6 text-xs text-neutral-500">
        <a className="underline" href="/privacy">
          개인정보처리방침
        </a>
        {" · "}
        <a className="underline" href="/support">
          지원·이용약관·환불 안내
        </a>
      </p>
    </main>
  );
}
