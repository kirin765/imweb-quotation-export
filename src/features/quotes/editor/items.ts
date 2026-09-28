import type { QuoteItem } from "@/features/quotes/model";

/** 아직 아무것도 입력하지 않은 자리표시용 행인지. */
export const isBlankItem = (item: QuoteItem) =>
  item.productName.trim() === "" && item.itemCode.trim() === "" && item.optionName.trim() === "";

/**
 * 가져온 행을 기존 초안에 합친다.
 * 입력이 하나도 없는 빈 초안(자리표시용 행뿐)이면 그 행들을 대체한다. 그 상태에서 붙이면
 * 빈 행 때문에 저장·내보내기가 막혀 사용자가 이유를 알기 어렵다.
 * 내용이 있는 초안에는 절대 덮어쓰지 않고 뒤에 붙인다.
 */
export function mergeImportedItems(
  existing: readonly QuoteItem[],
  imported: QuoteItem[],
): { items: QuoteItem[]; replacedBlanks: boolean } {
  const hasContent = existing.some((item) => !isBlankItem(item));
  if (hasContent) {
    return { items: [...existing, ...imported], replacedBlanks: false };
  }
  return { items: [...imported], replacedBlanks: existing.length > 0 };
}
