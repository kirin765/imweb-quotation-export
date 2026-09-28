"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createEmptyItem,
  formatDateTime,
  formatKrw,
  MAX_CSV_ROWS,
  validateDocument,
  type DocumentValidation,
  type QuoteDocument,
  type QuoteItem,
} from "@/features/quotes/model";
import { decodeCsvBytes, parseItemCsv, type CsvCellError } from "@/features/quotes/csv";
import { XlsxReadError, isOleFile, isZipFile, readXlsxRows, rowsToCsv } from "@/features/quotes/xlsx-read";
import { downloadXlsx, openPrintWindow, recordExportEvent } from "@/features/quotes/client-export";
import { ProductPicker } from "@/features/quotes/editor/ProductPicker";
import { DocumentFields, ErrorText, inputClass } from "@/features/quotes/editor/DocumentFields";
import { ItemsTable } from "@/features/quotes/editor/ItemsTable";
import { mergeImportedItems } from "@/features/quotes/editor/items";
import {
  AdjustmentFields,
  CalculationNote,
  TotalsPanel,
} from "@/features/quotes/editor/AdjustmentFields";

type SavedDraft = {
  id: string;
  revision: number;
  version: number;
  updatedAt: string;
  doc: QuoteDocument;
};

type VersionSummary = {
  id: string;
  version: number;
  documentNumber: string;
  total: number;
  confirmedAt: string;
};

type AuditEvent = {
  event: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

type PendingImport = {
  source: string;
  items: QuoteItem[];
  errors: CsvCellError[];
  dataRowCount: number;
};

const EVENT_LABEL: Record<string, string> = {
  created: "초안 생성",
  updated: "저장",
  confirmed: "확정",
  duplicated: "복제",
  deleted: "삭제",
  exported: "내보내기",
};

type DraftResponse = {
  draft: SavedDraft;
  versions: VersionSummary[];
  audit: AuditEvent[];
  message?: string;
  current?: SavedDraft;
  validation?: DocumentValidation;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<{ res: Response; body: T }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { res, body };
}

export function SavedQuoteEditor({
  initialDraft,
  initialVersions,
  initialAudit,
}: {
  initialDraft: SavedDraft;
  initialVersions: VersionSummary[];
  initialAudit: AuditEvent[];
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<QuoteDocument>(initialDraft.doc);
  const [revision, setRevision] = useState(initialDraft.revision);
  const [versions, setVersions] = useState(initialVersions);
  const [audit, setAudit] = useState(initialAudit);
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importHeaderError, setImportHeaderError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<SavedDraft | null>(null);
  const [editSeq, setEditSeq] = useState(0);
  const [autoSaved, setAutoSaved] = useState(0);

  const validation = useMemo(() => validateDocument(doc), [doc]);

  /**
   * 저장 시점에 최신 값이 필요하다. 자동 저장이 진행 중일 때 사용자가 저장을 누르면
   * 앞선 저장을 기다린 뒤 최신 revision으로 다시 저장해야 하므로, 값은 ref로 읽는다.
   */
  const latest = useRef({ doc, revision, editSeq });
  useEffect(() => {
    latest.current = { doc, revision, editSeq };
  }, [doc, revision, editSeq]);

  const saveRef = useRef<(options?: { silent?: boolean }) => Promise<number | null>>(async () => null);
  const inFlight = useRef<Promise<number | null> | null>(null);

  /**
   * 편집이 멈추면 자동 저장한다. 값이 어긋나면 저장하지 않고 오류만 보여준다.
   * 충돌이 난 뒤에는 자동 저장을 멈춰 남의 저장을 계속 덮어쓰지 않게 한다.
   */
  useEffect(() => {
    if (!dirty || conflict) {
      return;
    }
    const timer = setTimeout(() => {
      void saveRef.current({ silent: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [editSeq, dirty, conflict]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const change = (next: QuoteDocument) => {
    setDoc(next);
    setDirty(true);
    setEditSeq((prev) => prev + 1);
    setMessage(null);
  };

  const update = (patch: Partial<QuoteDocument>) => change({ ...doc, ...patch });
  const updateSupplier = (key: keyof QuoteDocument["supplier"], value: string) =>
    change({ ...doc, supplier: { ...doc.supplier, [key]: value } });
  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    change({
      ...doc,
      items: doc.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  const removeItem = (id: string) =>
    change({ ...doc, items: doc.items.filter((item) => item.id !== id) });
  const addItem = () => change({ ...doc, items: [...doc.items, createEmptyItem()] });
  const addItems = (rows: QuoteItem[]) => {
    change({ ...doc, items: [...doc.items, ...rows] });
    setMessage(`아임웹 상품 ${rows.length}개 행을 추가했습니다. 제안 단가를 확인해 주세요.`);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const bytes = await file.arrayBuffer();
    // 엑셀(.xlsx)은 첫 시트의 값을 읽어 CSV로 바꾼 뒤 같은 가져오기 경로를 태운다.
    if (isZipFile(bytes) || isOleFile(bytes)) {
      try {
        const { rows, sheetName } = await readXlsxRows(bytes);
        handleCsvText(rowsToCsv(rows), `${file.name} · ${sheetName} 시트`);
      } catch (error) {
        setImportHeaderError(
          error instanceof XlsxReadError ? error.message : "엑셀 파일을 읽지 못했습니다.",
        );
        setImportWarnings([]);
      }
      return;
    }
    const { text, encoding } = decodeCsvBytes(bytes);
    handleCsvText(text, encoding === "euc-kr" ? `${file.name} (EUC-KR로 읽음)` : file.name);
  };

  const handleCsvText = (text: string, source: string) => {
    const result = parseItemCsv(text);
    setImportHeaderError(result.headerError);
    setImportWarnings(result.warnings);
    setMessage(null);
    if (result.headerError) {
      setPendingImport(null);
      return;
    }
    if (result.errors.length > 0) {
      setPendingImport({
        source,
        items: result.items,
        errors: result.errors,
        dataRowCount: result.dataRowCount,
      });
      return;
    }
    applyImport(result.items, source, result.dataRowCount);
  };

  const applyImport = (items: QuoteItem[], source: string, dataRowCount: number) => {
    const merged = mergeImportedItems(doc.items, items);
    change({ ...doc, items: merged.items });
    setPendingImport(null);
    setImportHeaderError(null);
    setMessage(
      `${source}에서 ${items.length}행을 가져왔습니다.${
        merged.replacedBlanks ? " 비어 있던 행은 대체했습니다." : ""
      } (데이터 ${dataRowCount}행)`,
    );
  };

  const refreshFromServer = async (draftId: string) => {
    const { res, body } = await requestJson<DraftResponse>(`/api/quotes/${draftId}`);
    if (!res.ok) {
      setError(body.message ?? "최신 내용을 불러오지 못했습니다.");
      return false;
    }
    setDoc(body.draft.doc);
    setRevision(body.draft.revision);
    setVersions(body.versions);
    setAudit(body.audit);
    setDirty(false);
    setConflict(null);
    setMessage("서버의 최신 내용을 불러왔습니다.");
    return true;
  };

  const performSave = async (silent: boolean): Promise<number | null> => {
    const current = latest.current;
    if (!silent && !validateDocument(current.doc).valid) {
      setShowErrors(true);
      setError("입력 오류를 수정한 뒤 저장하세요.");
      return null;
    }
    if (silent && !validateDocument(current.doc).valid) {
      setShowErrors(true);
      setError("입력 오류가 있어 자동 저장하지 않았습니다. 고치면 자동으로 저장됩니다.");
      return null;
    }

    setBusy(true);
    setError(null);
    const savedSeq = current.editSeq;
    try {
      const { res, body } = await requestJson<{
        ok?: boolean;
        revision?: number;
        message?: string;
        current?: SavedDraft;
        validation?: DocumentValidation;
      }>(`/api/quotes/${initialDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: current.doc, revision: current.revision }),
      });
      if (res.status === 409) {
        setConflict(body.current ?? null);
        setError(body.message ?? "다른 화면에서 먼저 저장했습니다.");
        return null;
      }
      if (res.status === 422) {
        setShowErrors(true);
        setError("입력 오류가 있어 저장하지 않았습니다. 고치면 자동으로 저장됩니다.");
        return null;
      }
      if (!res.ok || body.revision === undefined) {
        setError(body.message ?? "저장하지 못했습니다.");
        return null;
      }
      setRevision(body.revision);
      if (latest.current.editSeq === savedSeq) {
        setDirty(false);
      }
      if (silent) {
        setAutoSaved((prev) => prev + 1);
        setMessage(`자동 저장했습니다. (revision ${body.revision})`);
      } else {
        setMessage(`저장했습니다. (revision ${body.revision})`);
      }
      return body.revision;
    } catch {
      setError("저장하지 못했습니다. 네트워크를 확인해 주세요.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (options: { silent?: boolean } = {}): Promise<number | null> => {
    if (inFlight.current) {
      await inFlight.current.catch(() => undefined);
    }
    const task = performSave(options.silent ?? false);
    inFlight.current = task;
    try {
      return await task;
    } finally {
      if (inFlight.current === task) {
        inFlight.current = null;
      }
    }
  };

  useEffect(() => {
    saveRef.current = save;
  });

  const saveIfDirty = async (): Promise<number | null> => (dirty ? await save() : revision);

  const confirm = async () => {
    setShowErrors(true);
    const valid = validateDocument(doc);
    if (!valid.valid) {
      setError("확정할 수 없는 값이 있습니다. 오류를 수정한 뒤 다시 시도하세요.");
      return;
    }
    const currentRevision = await saveIfDirty();
    if (currentRevision === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { res, body } = await requestJson<{
        ok?: boolean;
        version?: number;
        message?: string;
        current?: SavedDraft;
      }>(`/api/quotes/${initialDraft.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: currentRevision }),
      });
      if (res.status === 409) {
        setConflict(body.current ?? null);
        setError(body.message ?? "다른 화면에서 먼저 저장했습니다.");
        return;
      }
      if (!res.ok) {
        setError(body.message ?? "확정하지 못했습니다.");
        return;
      }
      setMessage(`v${body.version}으로 확정했습니다. 확정본은 수정되지 않고 새 버전으로만 쌓입니다.`);
      await refreshFromServer(initialDraft.id);
    } catch {
      setError("확정하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    const saved = await saveIfDirty();
    if (saved === null) {
      setError("복제하기 전에 저장이 필요합니다. 충돌을 해결한 뒤 다시 시도하세요.");
      return;
    }
    setBusy(true);
    try {
      const { res, body } = await requestJson<{ draft?: SavedDraft; message?: string }>(
        `/api/quotes/${initialDraft.id}/versions`,
        { method: "POST" },
      );
      if (!res.ok || !body.draft) {
        setError(body.message ?? "복제하지 못했습니다.");
        return;
      }
      router.push(`/quotes/${body.draft.id}`);
    } catch {
      setError("복제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("이 초안을 목록에서 삭제할까요? 확정 버전은 남습니다.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${initialDraft.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("삭제하지 못했습니다.");
        return;
      }
      router.push("/quotes");
    } finally {
      setBusy(false);
    }
  };

  const handleXlsx = () => {
    setShowErrors(true);
    if (!validation.valid) {
      setError("입력 오류를 수정한 뒤 내보내세요.");
      return;
    }
    const name = downloadXlsx(doc);
    recordExportEvent(initialDraft.id, "xlsx");
    setMessage(
      `${name} 파일을 만들었습니다. XLSX는 자동 재계산되지 않으니 수정 후에는 여기서 다시 내보내세요.`,
    );
  };

  const handlePrint = () => {
    setShowErrors(true);
    if (!validation.valid) {
      setError("입력 오류를 수정한 뒤 인쇄하세요.");
      return;
    }
    openPrintWindow(doc, "/print");
    recordExportEvent(initialDraft.id, "print");
  };

  const errorLines = pendingImport
    ? [...new Set(pendingImport.errors.map((item) => item.line))].sort((a, b) => a - b)
    : [];
  const issueCount =
    validation.documentErrors.length +
    validation.itemErrors.filter((errors) => Object.keys(errors).length > 0).length +
    (validation.adjustmentError ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-xl font-bold">
            견적 초안 <span className="text-neutral-500">{doc.documentNumber}</span>
          </h1>
          <p className="mt-1 text-xs text-neutral-600">
            마지막 저장 {formatDateTime(initialDraft.updatedAt)} · revision {revision} · 다음 확정 시
            v{doc.version} · {doc.items.length}행 · 편집이 멈추면 자동 저장됩니다
            {autoSaved > 0 ? ` · 자동 저장 ${autoSaved}회` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href="/quotes"
          >
            목록으로
          </Link>
          <Link
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            href="/billing"
          >
            이용권·연동 해제
          </Link>
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void save()}
            type="button"
          >
            {dirty ? "저장 *" : "저장"}
          </button>
          <button
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void confirm()}
            type="button"
          >
            확정하고 새 버전 만들기
          </button>
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => void duplicate()}
            type="button"
          >
            복제
          </button>
          <button
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => void remove()}
            type="button"
          >
            삭제
          </button>
        </div>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span
          className={
            validation.valid
              ? "rounded bg-green-100 px-2 py-1 font-semibold text-green-800"
              : "rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800"
          }
        >
          {validation.valid ? "저장·확정 가능" : `확인 필요 ${issueCount}건`}
        </span>
        {dirty ? (
          <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800">
            {busy ? "저장 중…" : "자동 저장 대기"}
          </span>
        ) : null}
        {message ? <span className="text-neutral-800">{message}</span> : null}
        {error ? <span className="font-semibold text-red-700">{error}</span> : null}
      </div>

      {conflict ? (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-xs">
          <p className="font-semibold text-red-900">
            다른 화면에서 이 초안을 먼저 바꿨습니다. 지금 저장하면 그 내용을 덮어쓰게 됩니다.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => void refreshFromServer(initialDraft.id)}
              type="button"
            >
              최신 내용 불러오기
            </button>
            <button
              className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
              onClick={() => setConflict(null)}
              type="button"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <DocumentFields
            doc={doc}
            onToggleSupplier={() => setShowSupplier((prev) => !prev)}
            showErrors={showErrors}
            showSupplier={showSupplier}
            update={update}
            updateSupplier={updateSupplier}
            validation={validation}
          />

          <ProductPicker onAdd={addItems} />

          <section className="rounded border border-neutral-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">품목 ({doc.items.length}행)</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  CSV 파일 가져오기
                </button>
                <button
                  className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
                  onClick={() => setPasteOpen((prev) => !prev)}
                  type="button"
                >
                  CSV 붙여넣기
                </button>
                <button
                  className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
                  onClick={addItem}
                  type="button"
                >
                  빈 행 추가
                </button>
              </div>
            </div>
            <input
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <p className="mt-2 text-xs text-neutral-500">
              열: item_code, product_name, option_name, quantity, unit_price · 최대 {MAX_CSV_ROWS}행 ·
              .csv와 .xlsx를 읽고, CSV는 UTF-8·EUC-KR을 자동으로 구분합니다. 구형 .xls는 .xlsx나
              CSV로 저장해 주세요.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              실제 파일의 열 이름도 인식합니다: 상품명·품목·품명, 수량·주문수량, 단가·공급가·판매가·
              공급가액. 수량 열이 없으면 1로 채우고, 단가 없이 금액만 있으면 금액 ÷ 수량으로 계산합니다.
            </p>

            {pasteOpen ? (
              <div className="mt-3">
                <textarea
                  className={`${inputClass} font-mono`}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder="item_code,product_name,option_name,quantity,unit_price"
                  rows={5}
                  value={pasteText}
                />
                <button
                  className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => handleCsvText(pasteText, "붙여넣은 CSV")}
                  type="button"
                >
                  붙여넣은 CSV 확인
                </button>
              </div>
            ) : null}

            {importHeaderError ? (
              <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                파일을 가져오지 않았습니다. {importHeaderError}
              </p>
            ) : null}
            {importWarnings.length > 0 && !importHeaderError ? (
              <ul className="mt-3 space-y-1 rounded bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
                {importWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            {pendingImport ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
                <p className="font-semibold text-amber-900">
                  {pendingImport.source}: 데이터 {pendingImport.dataRowCount}행 중 {errorLines.length}
                  행에 오류가 있습니다. 아무 행도 자동으로 가져오지 않았습니다.
                </p>
                <table className="mt-2 w-full border-collapse text-left">
                  <tbody>
                    {pendingImport.errors.map((item, index) => (
                      <tr key={`${item.line}-${item.column}-${index}`}>
                        <td className="border-b border-amber-200 py-1 pr-2">{item.line}</td>
                        <td className="border-b border-amber-200 py-1 pr-2">{item.column}</td>
                        <td className="border-b border-amber-200 py-1">{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    disabled={pendingImport.items.length === 0}
                    onClick={() =>
                      applyImport(
                        pendingImport.items,
                        `${pendingImport.source} (오류 ${errorLines.length}행 제외)`,
                        pendingImport.dataRowCount,
                      )
                    }
                    type="button"
                  >
                    오류 {errorLines.length}행 제외하고 {pendingImport.items.length}행 가져오기
                  </button>
                  <button
                    className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
                    onClick={() => setPendingImport(null)}
                    type="button"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : null}
            <ErrorText
              message={
                showErrors
                  ? validation.documentErrors.find((item) => item.field === "items")?.message
                  : undefined
              }
            />

            <ItemsTable
              items={doc.items}
              removeItem={removeItem}
              showErrors={showErrors}
              updateItem={updateItem}
              validation={validation}
            />
          </section>

          <AdjustmentFields
            doc={doc}
            showErrors={showErrors}
            update={update}
            validation={validation}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <TotalsPanel doc={doc} showErrors={showErrors} validation={validation} />

          <section className="rounded border border-neutral-300 bg-white p-4">
            <h2 className="text-sm font-bold">확정 버전 ({versions.length})</h2>
            {versions.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                아직 확정한 버전이 없습니다. 확정하면 이 시점의 내용이 snapshot으로 남고, 이후 수정은
                새 버전으로만 쌓입니다.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {versions.map((version) => (
                  <li className="border-b border-neutral-200 pb-2" key={version.id}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">v{version.version}</span>
                      <a
                        className="text-blue-700 underline"
                        href={`/quotes/versions/${version.id}/print`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        인쇄 / PDF
                      </a>
                    </div>
                    <p className="text-neutral-600">
                      {formatKrw(version.total)} · {formatDateTime(version.confirmedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-neutral-300 bg-white p-4">
            <h2 className="text-sm font-bold">내보내기</h2>
            <button
              className="mt-3 w-full rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleXlsx}
              type="button"
            >
              XLSX 다운로드
            </button>
            <button
              className="mt-2 w-full rounded border border-neutral-400 bg-white px-3 py-2 text-sm font-semibold"
              onClick={handlePrint}
              type="button"
            >
              인쇄 화면 열기 (PDF로 저장)
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              지금 화면의 초안을 인쇄합니다. 이미 확정한 내용을 그대로 출력하려면 위 확정 버전의
              인쇄를 쓰세요.
            </p>
          </section>

          <section className="rounded border border-neutral-300 bg-white p-4">
            <h2 className="text-sm font-bold">이력</h2>
            <ul className="mt-2 space-y-1 text-xs text-neutral-600">
              {audit.length === 0 ? <li>기록이 없습니다.</li> : null}
              {audit.map((event, index) => (
                <li key={`${event.event}-${event.createdAt}-${index}`}>
                  {EVENT_LABEL[event.event] ?? event.event} · {formatDateTime(event.createdAt)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-neutral-500">
              이력에는 본문·수신처를 남기지 않습니다.
            </p>
          </section>

          <CalculationNote />
        </aside>
      </div>
    </div>
  );
}
