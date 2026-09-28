/**
 * 앱 이용권 플랜. 결제수단·수익쉐어 비율은 합의 전이므로 코드에 확정값을 박지 않는다.
 * BILLING_PROVIDER/BILLING_PLAN_CODE가 없으면 free 플랜으로만 동작하고 유료 업그레이드 버튼을 노출하지 않는다.
 */
export const FREE_PLAN = "free";

export type PlanConfig = {
  code: string;
  name: string;
  priceKrw: number;
  trialDays: number;
  /** 유료 결제 연동이 준비되었는지. false면 업그레이드 UI를 감춘다. */
  paid: boolean;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function planConfig(): PlanConfig {
  const code = process.env.BILLING_PLAN_CODE?.trim() ?? "";
  const provider = process.env.BILLING_PROVIDER?.trim() ?? "";
  const configured = code !== "" && provider !== "";
  return {
    code: configured ? code : FREE_PLAN,
    name: configured ? "견적서 이용권" : "무료",
    priceKrw: configured ? toPositiveInt(process.env.BILLING_PRICE_KRW, 0) : 0,
    trialDays: configured ? toPositiveInt(process.env.BILLING_TRIAL_DAYS, 14) : 0,
    paid: configured,
  };
}

export type EntitlementStatus = "trialing" | "active" | "past_due" | "cancelled" | "free" | "expired";

export type Entitlement = {
  siteCode: string;
  planCode: string;
  status: EntitlementStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** 지금 견적 편집·내보내기를 쓸 수 있는가. */
  canUseApp: boolean;
  /** 유료 기능(예: 무제한 확정본)을 쓸 수 있는가. */
  isPaid: boolean;
  message: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 무료/체험/유료 상태를 사람이 읽을 수 있게 판정한다.
 * trial이 끝났는데 active 결제 이벤트가 없으면 expired로 떨어뜨려 쓰기를 막는다.
 */
export function evaluateEntitlement(input: {
  siteCode: string;
  planCode: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  now?: number;
}): Entitlement {
  const now = input.now ?? Date.now();
  const trialEnds = input.trialEndsAt ? Date.parse(input.trialEndsAt) : null;
  const periodEnds = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : null;
  const config = planConfig();
  const base = {
    siteCode: input.siteCode,
    planCode: input.planCode,
    trialEndsAt: input.trialEndsAt,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  };

  if (input.status === "active" && (periodEnds === null || periodEnds > now)) {
    return {
      ...base,
      status: "active",
      isPaid: true,
      canUseApp: true,
      message: input.cancelAtPeriodEnd
        ? "이용권이 기간 만료로 종료될 예정입니다. 만료 전까지 사용할 수 있습니다."
        : "이용권이 활성 상태입니다.",
    };
  }
  if (input.status === "active" && periodEnds !== null && periodEnds <= now) {
    return { ...base, status: "expired", isPaid: false, canUseApp: false, message: "이용권 기간이 만료되었습니다." };
  }
  if (input.status === "trialing") {
    if (trialEnds === null || trialEnds > now) {
      return {
        ...base,
        status: "trialing",
        isPaid: true,
        canUseApp: true,
        message: trialEnds
          ? `체험 기간입니다. ${new Date(trialEnds).toLocaleDateString("ko-KR")}까지 사용할 수 있습니다.`
          : "체험 기간입니다.",
      };
    }
    return { ...base, status: "expired", isPaid: false, canUseApp: false, message: "체험 기간이 끝났습니다." };
  }
  if (input.status === "past_due") {
    return {
      ...base,
      status: "past_due",
      isPaid: false,
      canUseApp: false,
      message: "결제가 실패했습니다. 결제 정보를 확인해 주세요.",
    };
  }
  if (input.status === "cancelled") {
    return { ...base, status: "cancelled", isPaid: false, canUseApp: false, message: "이용권이 해지되었습니다." };
  }
  return {
    ...base,
    status: "free",
    isPaid: false,
    canUseApp: true,
    message: config.paid ? "무료 플랜입니다." : "무료 플랜으로 사용 중입니다.",
  };
}

export const trialEndFromNow = (days: number, now = Date.now()) =>
  new Date(now + days * DAY_MS).toISOString();

export const periodEndFromNow = (days = 31, now = Date.now()) =>
  new Date(now + days * DAY_MS).toISOString();
