export function NotInstalled({ what }: { what: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-sm">
      <h1 className="text-lg font-bold">{what}을 쓰려면 앱을 실행해 주세요</h1>
      <p className="mt-3 leading-relaxed text-neutral-700">
        이 화면은 연동된 아임웹 사이트 세션이 있어야 열립니다. 아임웹 관리자 &gt; 앱에서 이 앱을
        실행하면 사이트 인증을 거쳐 바로 이곳으로 들어옵니다.
      </p>
      <p className="mt-3 text-neutral-600">
        서버 저장 없이 편집만 연습하려면{" "}
        <a className="font-semibold text-blue-700 underline" href="/demo">
          견적서 데모
        </a>
        를 쓰세요. 입력한 내용은 브라우저를 벗어나지 않습니다.
      </p>
    </main>
  );
}
