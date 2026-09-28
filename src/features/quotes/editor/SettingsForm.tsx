"use client";

import Link from "next/link";

import { useState } from "react";
import { formatDateTime, type SupplierInfo } from "@/features/quotes/model";
import { FieldLabel, SUPPLIER_FIELDS, inputClass } from "@/features/quotes/editor/DocumentFields";

export function SettingsForm({
  siteCode,
  siteName,
  initialSupplier,
}: {
  siteCode: string;
  siteName?: string;
  initialSupplier: SupplierInfo;
}) {
  const [supplier, setSupplier] = useState<SupplierInfo>(initialSupplier);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier }),
      });
      const body = (await res.json()) as { message?: string; supplier?: SupplierInfo };
      if (!res.ok) {
        setMessage(body.message ?? "설정을 저장하지 못했습니다.");
        return;
      }
      setSupplier(body.supplier ?? supplier);
      setSavedAt(new Date().toISOString());
      setMessage("저장했습니다. 앞으로 새로 만드는 견적에만 적용됩니다.");
    } catch {
      setMessage("설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="border-b border-neutral-300 pb-4">
        <h1 className="text-xl font-bold">공급자 표시 정보</h1>
        <p className="mt-1 text-xs text-neutral-600">
          {siteName ? `${siteName}(${siteCode})` : siteCode} 사이트에 저장됩니다. 견적서의 공급자 칸과
          XLSX·PDF에 그대로 들어갑니다.
        </p>
      </header>

      <section className="mt-4 rounded border border-neutral-300 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {SUPPLIER_FIELDS.map((field) => (
            <label className="block" key={field.key}>
              <FieldLabel>{field.label}</FieldLabel>
              <input
                className={inputClass}
                onChange={(event) =>
                  setSupplier((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                value={supplier[field.key]}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void save()}
            type="button"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
          <Link className="text-xs text-neutral-700 underline" href="/quotes">
            견적 목록으로
          </Link>
          {savedAt ? (
            <span className="text-xs text-neutral-600">저장시각 {formatDateTime(savedAt)}</span>
          ) : null}
          {message ? <span className="text-xs font-semibold text-neutral-800">{message}</span> : null}
        </div>

        <p className="mt-4 rounded bg-neutral-50 p-3 text-xs text-neutral-600">
          이미 확정한 견적은 그 시점의 공급자 정보를 snapshot으로 보관하므로 여기서 바꿔도 소급
          반영되지 않습니다. 확정 전 초안은 문서 정보의 공급자 칸에서 바로 고칠 수 있습니다.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          로고 업로드는 아직 없습니다. 형식·크기 제한과 이미지 재인코딩을 함께 정한 뒤 추가합니다.
        </p>
      </section>
    </main>
  );
}
