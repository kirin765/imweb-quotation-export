"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  createEmptyItem,
  formatDateTime,
  MAX_CSV_ROWS,
  validateDocument,
  type QuoteDocument,
  type QuoteItem,
} from "@/features/quotes/model";
import { decodeCsvBytes, parseItemCsv, type CsvCellError } from "@/features/quotes/csv";
import { XlsxReadError, isOleFile, isZipFile, readXlsxRows, rowsToCsv } from "@/features/quotes/xlsx-read";
import { downloadXlsx, openPrintWindow } from "@/features/quotes/client-export";
import { saveDocument } from "@/features/quotes/storage";
import { createEmptyDocument, createSampleDocument } from "@/fixtures/samples";
import { ProductPicker } from "@/features/quotes/editor/ProductPicker";
import { DocumentFields, ErrorText, inputClass } from "@/features/quotes/editor/DocumentFields";
import { ItemsTable } from "@/features/quotes/editor/ItemsTable";
import { mergeImportedItems } from "@/features/quotes/editor/items";
import {
  AdjustmentFields,
  CalculationNote,
  TotalsPanel,
} from "@/features/quotes/editor/AdjustmentFields";

type PendingImport = {
  source: string;
  items: QuoteItem[];
  errors: CsvCellError[];
  dataRowCount: number;
};

export function QuoteDemo() {
  const [doc, setDoc] = useState<QuoteDocument>(() => createSampleDocument());
  const [exportAttempted, setExportAttempted] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importHeaderError, setImportHeaderError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSupplier, setShowSupplier] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => validateDocument(doc), [doc]);

  useEffect(() => {
    saveDocument(doc);
  }, [doc]);

  const update = (patch: Partial<QuoteDocument>) => {
    setDoc((prev) => ({ ...prev, ...patch }));
  };

  const updateSupplier = (key: keyof QuoteDocument["supplier"], value: string) => {
    setDoc((prev) => ({ ...prev, supplier: { ...prev.supplier, [key]: value } }));
  };

  const updateItem = (id: string, patch: Partial<QuoteItem>) => {
    setDoc((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setDoc((prev) => ({ ...prev, items: [...prev.items, createEmptyItem()] }));
  };

  const addItems = (rows: QuoteItem[]) => {
    setDoc((prev) => ({ ...prev, items: [...prev.items, ...rows] }));
    setStatusMessage(`상품 ${rows.length}개 행을 추가했습니다. 제안 단가를 확인해 주세요.`);
  };

  const removeItem = (id: string) => {
    setDoc((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
  };

  const resetDraft = () => {
    setDoc(createEmptyDocument());
    setExportAttempted(false);
    setPendingImport(null);
    setImportHeaderError(null);
    setStatusMessage("빈 견적으로 초기화했습니다.");
  };

  const loadSample = () => {
    setDoc(createSampleDocument());
    setExportAttempted(false);
    setPendingImport(null);
    setImportHeaderError(null);
    setStatusMessage("합성 상품 10개 샘플을 불러왔습니다.");
  };

  const handleCsvText = (text: string, source: string) => {
    const result = parseItemCsv(text);
    setImportHeaderError(result.headerError);
    setImportWarnings(result.warnings);
    setStatusMessage(null);

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
    setDoc((prev) => ({ ...prev, items: merged.items }));
    setPendingImport(null);
    setImportHeaderError(null);
    setStatusMessage(
      `${source}에서 ${items.length}행을 가져왔습니다.${
        merged.replacedBlanks ? " 비어 있던 행은 대체했습니다." : ""
      } (데이터 ${dataRowCount}행)`,
    );
  };

  const confirmPartialImport = () => {
    if (!pendingImport) {
      return;
    }
    const errorLines = new Set(pendingImport.errors.map((error) => error.line));
    applyImport(
      pendingImport.items,
      `${pendingImport.source} (오류 ${errorLines.size}행 제외)`,
      pendingImport.dataRowCount,
    );
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

  const handleXlsx = () => {
    setExportAttempted(true);
    if (!validation.valid) {
      setStatusMessage("입력 오류를 수정한 뒤 다시 내보내세요.");
      return;
    }
    const name = downloadXlsx(doc);
    setStatusMessage(
      `${name} 파일을 만들었습니다. XLSX는 편집 가능하지만 합계가 자동 재계산되지 않습니다.`,
    );
  };

  const handlePrint = () => {
    setExportAttempted(true);
    if (!validation.valid) {
      setStatusMessage("입력 오류를 수정한 뒤 인쇄 화면을 열어 주세요.");
      return;
    }
    openPrintWindow(doc, "/demo/print");
  };

  const errorLines = pendingImport
    ? [...new Set(pendingImport.errors.map((error) => error.line))].sort((a, b) => a - b)
    : [];

  const issueCount =
    validation.documentErrors.length +
    validation.itemErrors.filter((errors) => Object.keys(errors).length > 0).length +
    (validation.adjustmentError ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-xl font-bold">견적서 화면 미리보기</h1>
          <p className="mt-1 text-xs text-neutral-600">
            설치 없이 견적 편집 화면을 그대로 보실 수 있습니다. 여기서는 서버에 저장하지 않고 이 브라우저
            안에만 남습니다. 견적 저장·확정 버전·이력은 아임웹 관리자에서 앱을 실행하면 바로 쓸 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={loadSample}
            type="button"
          >
            합성 상품 10개 불러오기
          </button>
          <button
            className="rounded border border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={resetDraft}
            type="button"
          >
            초기화
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
          {validation.valid ? "내보내기 가능" : `확인 필요 ${issueCount}건`}
        </span>
        <span className="text-neutral-600">
          문서번호 {doc.documentNumber} · 버전 v{doc.version} · 작성시각{" "}
          {formatDateTime(doc.createdAt)}
        </span>
        {statusMessage ? <span className="text-neutral-800">{statusMessage}</span> : null}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <DocumentFields
            doc={doc}
            onToggleSupplier={() => setShowSupplier((prev) => !prev)}
            showErrors={exportAttempted}
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
              열: item_code, product_name, option_name, quantity, unit_price · 최대 1MB ·{" "}
              {MAX_CSV_ROWS}행 · 품목 코드의 앞자리 0은 그대로 유지됩니다. .csv와 .xlsx를 읽고,
              CSV는 UTF-8과 EUC-KR을 자동으로 구분합니다. 구형 .xls는 .xlsx나 CSV로 저장해 주세요.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              실제 파일의 열 이름도 인식합니다: 상품명·품목·품명, 수량·주문수량, 단가·공급가·판매가·
              공급가액. 수량 열이 없으면 1로 채우고, 단가 없이 금액만 있으면 금액 ÷ 수량으로 계산합니다.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              예시 파일:{" "}
              <a className="underline" href="/examples/product-list-export.csv" download>
                상품 목록 양식
              </a>
              {" · "}
              <a className="underline" href="/examples/quote-standard.csv" download>
                일반 견적서 양식
              </a>
              {" · "}
              <a className="underline" href="/examples/quote-amount-only.csv" download>
                금액만 있는 양식
              </a>
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
                  <thead>
                    <tr className="text-amber-900">
                      <th className="border-b border-amber-300 py-1 pr-2">CSV 행</th>
                      <th className="border-b border-amber-300 py-1 pr-2">열</th>
                      <th className="border-b border-amber-300 py-1">내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingImport.errors.map((error, index) => (
                      <tr key={`${error.line}-${error.column}-${index}`}>
                        <td className="border-b border-amber-200 py-1 pr-2">{error.line}</td>
                        <td className="border-b border-amber-200 py-1 pr-2">{error.column}</td>
                        <td className="border-b border-amber-200 py-1">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    disabled={pendingImport.items.length === 0}
                    onClick={confirmPartialImport}
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
                exportAttempted
                  ? validation.documentErrors.find((error) => error.field === "items")?.message
                  : undefined
              }
            />

            <ItemsTable
              items={doc.items}
              removeItem={removeItem}
              showErrors={exportAttempted}
              updateItem={updateItem}
              validation={validation}
            />
          </section>

          <AdjustmentFields
            doc={doc}
            showErrors={exportAttempted}
            update={update}
            validation={validation}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <TotalsPanel doc={doc} showErrors={exportAttempted} validation={validation} />

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
              PDF는 인쇄 전용 화면에서 브라우저의 &lsquo;PDF로 저장&rsquo;으로 만듭니다. 버튼 하나로
              PDF 파일을 직접 내려받는 기능은 아직 없습니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              XLSX는 수량·단가를 수정해도 합계가 자동 재계산되지 않습니다. 재계산이 필요하면 여기서
              수정 후 다시 내보내세요.
            </p>
          </section>

          <CalculationNote />
        </aside>
      </div>
    </div>
  );
}
