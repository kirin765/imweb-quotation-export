"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, formatKrw } from "@/features/quotes/model";

type DraftSummary = {
  id: string;
  documentNumber: string;
  version: number;
  revision: number;
  recipientCompany: string;
  itemCount: number;
  total: number;
  versionCount: number;
  updatedAt: string;
};

export function QuoteList({
  siteCode,
  siteName,
  initialDrafts,
}: {
  siteCode: string;
  siteName?: string;
  initialDrafts: DraftSummary[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (nextKeyword: string) => {
    setBusy(true);
    try {
      const query = nextKeyword.trim() === "" ? "" : `?q=${encodeURIComponent(nextKeyword.trim())}`;
      const res = await fetch(`/api/quotes${query}`);
      const body = (await res.json()) as { drafts?: DraftSummary[]; message?: string };
      if (!res.ok) {
        setMessage(body.message ?? "목록을 불러오지 못했습니다.");
        return;
      }
      setDrafts(body.drafts ?? []);
      setMessage(null);
    } catch {
      setMessage("목록을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  const create = async (source: "empty" | "sample") => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const body = (await res.json()) as { draft?: { id: string }; message?: string };
      if (!res.ok || !body.draft) {
        setMessage(body.message ?? "새 견적을 만들지 못했습니다.");
        return;
      }
      router.push(`/quotes/${body.draft.id}`);
    } catch {
      setMessage("새 견적을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-xl font-bold">견적 목록</h1>
          <p className="mt-1 text-xs text-neutral-600">
            {siteName ? `${siteName}(${siteCode})` : siteCode} 사이트의 견적만 표시됩니다. 다른 사이트의
            문서는 조회·수정·내보내기가 모두 차단됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void create("sample")}
            type="button"
          >
            샘플로 새 견적
          </button>
          <button
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void create("empty")}
            type="button"
          >
            빈 견적으로 시작
          </button>
          <Link
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href="/settings"
          >
            공급자 설정
          </Link>
          <Link
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href="/billing"
          >
            앱 이용권
          </Link>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="min-w-56 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void search(keyword);
            }
          }}
          placeholder="수신 회사명 또는 문서번호로 검색"
          value={keyword}
        />
        <button
          className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() => void search(keyword)}
          type="button"
        >
          검색
        </button>
      </div>

      {message ? <p className="mt-3 text-xs font-semibold text-red-700">{message}</p> : null}

      {drafts.length === 0 ? (
        <p className="mt-8 rounded border border-neutral-300 bg-white p-6 text-sm text-neutral-600">
          아직 저장한 견적이 없습니다. 위에서 새 견적을 만들어 보세요.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-600">
              <th className="py-2">문서번호</th>
              <th className="py-2">수신처</th>
              <th className="w-16 py-2 text-right">품목</th>
              <th className="w-28 py-2 text-right">총액</th>
              <th className="w-20 py-2 text-right">확정</th>
              <th className="w-40 py-2">마지막 저장</th>
              <th className="w-20 py-2" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr className="border-b border-neutral-200" key={draft.id}>
                <td className="py-2">
                  <Link className="font-semibold text-blue-700 underline" href={`/quotes/${draft.id}`}>
                    {draft.documentNumber}
                  </Link>
                </td>
                <td className="py-2">{draft.recipientCompany || "—"}</td>
                <td className="py-2 text-right">{draft.itemCount}</td>
                <td className="py-2 text-right">{formatKrw(draft.total)}</td>
                <td className="py-2 text-right">
                  {draft.versionCount === 0 ? "—" : `${draft.versionCount}건 (v${draft.version})`}
                </td>
                <td className="py-2 text-xs text-neutral-600">{formatDateTime(draft.updatedAt)}</td>
                <td className="py-2 text-right">
                  <Link className="text-xs text-neutral-700 underline" href={`/quotes/${draft.id}`}>
                    열기
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
