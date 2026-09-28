"use client";

import { useCallback, useEffect, useState } from "react";
import { newId, type QuoteItem } from "@/features/quotes/model";

type SessionInfo = {
  siteCode: string | null;
  siteName: string | null;
  unitCode: string | null;
  unitCurrency: string | null;
  installed: boolean;
  storeKind: "postgres" | "memory";
  scopes: string;
  billingEnabled: boolean;
};

type ShopProduct = {
  prodNo: number;
  prodCode: string;
  name: string;
  price: number;
  priceOrg: number;
  priceTax: string;
  prodStatus: string;
  prodType: string;
};

type OptionGroup = {
  optionCode: string;
  name: string;
  type: string;
  isRequire: string;
  optionValueList: { optionValueCode: string; optionValueName: string }[];
};

type OptionDetail = {
  optionDetailCode: string;
  price: number;
  stock: number;
  status: string;
  label: string;
};

const PRODUCT_PAGE_LIMIT = 40;
const OPTION_ROW_LIMIT = 50;

const STATUS_LABEL: Record<string, string> = {
  sale: "판매중",
  soldout: "품절",
  nosale: "숨김",
};

export function ProductPicker({ onAdd }: { onAdd: (items: QuoteItem[]) => void }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [keyword, setKeyword] = useState("");
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [currencyWarning, setCurrencyWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  const search = useCallback(async (nextKeyword: string) => {
    setSearching(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ limit: String(PRODUCT_PAGE_LIMIT) });
      if (nextKeyword.trim() !== "") {
        query.set("q", nextKeyword.trim());
      }
      const res = await fetch(`/api/imweb/products?${query}`);
      const body = (await res.json()) as {
        products?: ShopProduct[];
        priceNote?: string;
        currencyWarning?: string;
        message?: string;
      };
      if (!res.ok) {
        setProducts([]);
        setMessage(body.message ?? "상품을 불러오지 못했습니다. 앱을 다시 실행해 주세요.");
        return;
      }
      setProducts(body.products ?? []);
      setPriceNote(body.priceNote ?? null);
      setCurrencyWarning(body.currencyWarning ?? null);
      setSelected([]);
    } catch {
      setMessage("상품을 불러오지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json() as Promise<SessionInfo>)
      .then((info) => {
        if (cancelled) {
          return;
        }
        setSession(info);
        if (info.installed) {
          void search("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("연동 상태를 확인하지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const toggle = (prodNo: number) => {
    setSelected((prev) =>
      prev.includes(prodNo) ? prev.filter((value) => value !== prodNo) : [...prev, prodNo],
    );
  };

  const addSelected = async () => {
    setAdding(true);
    setMessage(null);
    const rows: QuoteItem[] = [];
    const failures: string[] = [];
    let truncated = 0;

    for (const prodNo of selected) {
      const product = products.find((item) => item.prodNo === prodNo);
      if (!product) {
        continue;
      }
      let groups: OptionGroup[] = [];
      let details: OptionDetail[] = [];
      try {
        const res = await fetch(`/api/imweb/products/${prodNo}/options`);
        if (res.ok) {
          const body = (await res.json()) as { groups?: OptionGroup[]; details?: OptionDetail[] };
          groups = body.groups ?? [];
          details = body.details ?? [];
        } else {
          failures.push(`${product.name}(옵션 조회 실패, 단가 수동 입력 필요)`);
        }
      } catch {
        failures.push(`${product.name}(옵션 조회 실패, 단가 수동 입력 필요)`);
      }

      // 실제 옵션 조합(option-details)이 있으면 그것을 행으로 쓴다. 정의를 임의로 곱하지 않는다.
      const labels =
        details.length > 0
          ? details.map((detail) => ({
              label: detail.label,
              price: detail.price > 0 ? detail.price : product.price,
            }))
          : groups.length > 0
            ? groups.flatMap((group) =>
                group.optionValueList.map((value) => ({
                  label: `${group.name}: ${value.optionValueName}`,
                  price: product.price,
                })),
              )
            : [{ label: "", price: product.price }];

      if (labels.length > OPTION_ROW_LIMIT) {
        truncated += labels.length - OPTION_ROW_LIMIT;
      }
      for (const { label, price } of labels.slice(0, OPTION_ROW_LIMIT)) {
        rows.push({
          id: newId(),
          itemCode: product.prodCode,
          productName: product.name,
          optionName: label,
          quantity: 1,
          unitPrice: Math.max(0, Math.round(price)),
        });
      }
    }

    setAdding(false);

    if (rows.length === 0) {
      setMessage("추가할 상품을 선택해 주세요.");
      return;
    }

    onAdd(rows);
    setSelected([]);
    const notes = [
      `${rows.length}개 행을 추가했습니다. 수량과 단가를 확인해 주세요.`,
      failures.length > 0 ? `옵션을 못 가져온 상품: ${failures.join(", ")}` : "",
      truncated > 0 ? `옵션 조합이 많아 ${truncated}개는 추가하지 않았습니다. 필요한 조합만 수동으로 넣어 주세요.` : "",
    ].filter(Boolean);
    setMessage(notes.join(" "));
  };

  if (!session) {
    return (
      <section className="rounded border border-neutral-300 bg-white p-4 text-xs text-neutral-500">
        연동 상태 확인 중…
      </section>
    );
  }

  if (!session.installed) {
    return (
      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="text-sm font-bold">아임웹 상품 불러오기</h2>
        <p className="mt-2 text-xs text-neutral-600">
          연동된 아임웹 사이트 세션이 없어 CSV와 수동 입력만 사용할 수 있습니다. 아임웹 관리자 &gt;
          앱에서 이 앱을 실행하면 상품을 바로 불러올 수 있습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">아임웹 상품 불러오기</h2>
        <span className="text-xs text-neutral-500">
          {session.siteName ?? session.siteCode} · {session.unitCurrency ?? "KRW"} · {session.scopes}
          {session.storeKind === "memory" ? " · 메모리 저장소(재배포 시 토큰 소실)" : ""}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="min-w-48 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void search(keyword);
            }
          }}
          placeholder="상품명으로 검색"
          value={keyword}
        />
        <button
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          disabled={searching}
          onClick={() => void search(keyword)}
          type="button"
        >
          {searching ? "검색 중…" : "검색"}
        </button>
        <button
          className="rounded border border-neutral-400 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          disabled={adding || selected.length === 0}
          onClick={() => void addSelected()}
          type="button"
        >
          {adding ? "추가 중…" : `선택 ${selected.length}개 견적에 추가`}
        </button>
      </div>

      {currencyWarning ? <p className="mt-2 text-xs text-red-700">{currencyWarning}</p> : null}
      {priceNote && !currencyWarning ? <p className="mt-2 text-xs text-amber-700">{priceNote}</p> : null}
      {message ? <p className="mt-2 text-xs text-neutral-700">{message}</p> : null}

      <div className="mt-3 max-h-72 overflow-y-auto rounded border border-neutral-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-neutral-100">
            <tr className="text-left text-neutral-600">
              <th className="w-8 px-2 py-1">선택</th>
              <th className="px-2 py-1">상품명</th>
              <th className="w-28 px-2 py-1">상품 코드</th>
              <th className="w-24 px-2 py-1 text-right">판매가(제안)</th>
              <th className="w-16 px-2 py-1">판매</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-neutral-500" colSpan={5}>
                  {searching ? "불러오는 중…" : "조회된 상품이 없습니다."}
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr className="border-t border-neutral-200" key={product.prodNo}>
                  <td className="px-2 py-1">
                    <input
                      checked={selected.includes(product.prodNo)}
                      onChange={() => toggle(product.prodNo)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-2 py-1">{product.name}</td>
                  <td className="px-2 py-1">{product.prodCode}</td>
                  <td className="px-2 py-1 text-right">{product.price.toLocaleString("ko-KR")}</td>
                  <td className="px-2 py-1">{STATUS_LABEL[product.prodStatus] ?? product.prodStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        옵션은 실제 옵션 조합(option-details)을 그대로 행으로 만듭니다. 같은 상품을 다시 추가해도 자동으로
        합치지 않으며, 표시 단가는 협의 단가의 제안값입니다.
      </p>
    </section>
  );
}
