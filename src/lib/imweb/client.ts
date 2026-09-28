import { API_BASE } from "./config";
import { apiError, type ImwebApiError } from "./oauth";

/** 인증 토큰으로 아임웹 OpenAPI를 호출한다. 응답의 data만 돌려준다. */
export async function callApi<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw await apiError(path, res);
  }
  const payload = (await res.json()) as { data?: T } & T;
  return (payload.data ?? payload) as T;
}

export type SiteUnit = { unitCode: string; name: string; currency: string };
export type SiteInfo = { siteCode: string; unitList: SiteUnit[] };

/** 사이트 정보와 유닛 목록. unitCode는 이 응답에서만 신뢰한다. */
export function getSiteInfo(token: string): Promise<SiteInfo> {
  return callApi<SiteInfo>(token, "/site-info").then((info) => ({
    siteCode: info.siteCode,
    unitList: Array.isArray(info.unitList) ? info.unitList : [],
  }));
}

/** 연동중 상태에서는 이 API만 쓸 수 있다. 호출 전에는 다른 API가 거부된다. */
export async function completeIntegration(token: string): Promise<void> {
  await callApi<boolean>(token, "/site-info/integration-complete", { method: "PATCH" });
}

/** 연동해제. 가이드상 아임웹 관리자에는 해제 기능이 없고, 해제하면 토큰이 삭제된다. */
export async function cancelIntegration(token: string): Promise<void> {
  await callApi<boolean>(token, "/site-info/integration-cancellation", { method: "PATCH" });
}

export type ShopProduct = {
  prodNo: number;
  prodCode: string;
  name: string;
  price: number;
  priceOrg: number;
  priceTax: string;
  prodStatus: string;
  prodType: string;
  unitCode: string;
};

export type ProductOptionValue = { optionValueCode: string; optionValueName: string };
export type ProductOptionGroup = {
  optionCode: string;
  name: string;
  type: string;
  isRequire: string;
  optionValueList: ProductOptionValue[];
};
export type ProductOptionDetail = {
  optionDetailCode: string;
  price: number;
  priceSupply: number;
  stock: number;
  status: string;
  /** "색상: 검정 / 사이즈: L" 처럼 조합 값을 사람이 읽게 만든 라벨. 못 만들면 "". */
  label: string;
};

type Page<T> = { totalCount?: number; totalPage?: number; currentPage?: number; pageSize?: number; list?: T[] };

export type ProductPage = {
  products: ShopProduct[];
  totalCount: number;
  totalPage: number;
  currentPage: number;
};

const toText = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(toText(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function mapProducts(payload: unknown): ShopProduct[] {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      prodNo: toNumber(item.prodNo),
      prodCode: toText(item.prodCode),
      name: toText(item.name),
      price: toNumber(item.price),
      priceOrg: toNumber(item.priceOrg),
      priceTax: toText(item.priceTax),
      prodStatus: toText(item.prodStatus),
      prodType: toText(item.prodType),
      unitCode: toText(item.unitCode),
    };
  });
}

export function mapOptionGroups(payload: unknown): ProductOptionGroup[] {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const values = Array.isArray(item.optionValueList) ? item.optionValueList : [];
    return {
      optionCode: toText(item.optionCode),
      name: toText(item.name),
      type: toText(item.type),
      isRequire: toText(item.isRequire),
      optionValueList: values.map((value) => {
        const v = (value ?? {}) as Record<string, unknown>;
        return { optionValueCode: toText(v.optionValueCode), optionValueName: toText(v.optionValueName) };
      }),
    };
  });
}

export function mapOptionDetails(payload: unknown): ProductOptionDetail[] {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const infos = Array.isArray(item.optionDetailInfoList) ? item.optionDetailInfoList : [];
    const label = infos
      .map((info) => {
        const i = (info ?? {}) as Record<string, unknown>;
        const value = (i.optionValue ?? {}) as Record<string, unknown>;
        const name = toText(i.name);
        const text = toText(value.optionValueName);
        return text ? `${name}: ${text}` : name;
      })
      .filter(Boolean)
      .join(" / ");
    return {
      optionDetailCode: toText(item.optionDetailCode),
      price: toNumber(item.price),
      priceSupply: toNumber(item.priceSupply),
      stock: toNumber(item.stock),
      status: toText(item.status),
      label,
    };
  });
}

function firstPage<T>(payload: unknown): Page<T> {
  const pages = Array.isArray(payload) ? (payload as Page<T>[]) : [];
  return pages.find((page) => Array.isArray(page.list)) ?? pages[0] ?? {};
}

/**
 * 상품 목록. `prodName`은 부분 일치 검색이며, unitCode는 site-info에서 얻은 값만 넘긴다.
 * 판매가(price)는 쿠폰·회원가·옵션 추가금 반영 전 값이라 협의 단가의 제안값으로만 쓴다.
 */
export async function listProducts(
  token: string,
  unitCode: string,
  options: { page?: number; limit?: number; prodName?: string } = {},
): Promise<ProductPage> {
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const query = new URLSearchParams({ page: String(page), limit: String(limit), unitCode });
  const name = options.prodName?.trim();
  if (name) {
    query.set("prodName", name);
  }
  const payload = await callApi<unknown>(token, `/products?${query}`);
  const pageData = firstPage<Record<string, unknown>>(payload);
  return {
    products: mapProducts(pageData.list ?? []),
    totalCount: toNumber(pageData.totalCount),
    totalPage: toNumber(pageData.totalPage),
    currentPage: toNumber(pageData.currentPage) || page,
  };
}

export async function getProduct(token: string, unitCode: string, prodNo: number): Promise<ShopProduct | null> {
  const payload = await callApi<Record<string, unknown>>(
    token,
    `/products/${prodNo}?${new URLSearchParams({ unitCode })}`,
  );
  const [product] = mapProducts([payload]);
  return product ?? null;
}

export async function listOptionGroups(
  token: string,
  unitCode: string,
  prodNo: number,
): Promise<ProductOptionGroup[]> {
  const query = new URLSearchParams({ page: "1", limit: "100", unitCode });
  const payload = await callApi<unknown>(token, `/products/${prodNo}/options?${query}`);
  return mapOptionGroups(firstPage<Record<string, unknown>>(payload).list ?? []);
}

export async function listOptionDetails(
  token: string,
  unitCode: string,
  prodNo: number,
): Promise<ProductOptionDetail[]> {
  const query = new URLSearchParams({ page: "1", limit: "100", unitCode });
  const payload = await callApi<unknown>(token, `/products/${prodNo}/option-details?${query}`);
  return mapOptionDetails(firstPage<Record<string, unknown>>(payload).list ?? []);
}

export const isImwebApiError = (error: unknown): error is ImwebApiError =>
  error instanceof Error && typeof (error as ImwebApiError).status === "number";
