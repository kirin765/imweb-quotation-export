"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/features/quotes/model";

type Entitlement = {
  siteCode: string;
  planCode: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canUseApp: boolean;
  isPaid: boolean;
  message: string;
};

type Status = {
  entitlement: Entitlement;
  plan: { code: string; name: string; priceKrw: number; trialDays: number };
  upgradeAvailable: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "체험 중",
  active: "이용 중",
  past_due: "결제 실패",
  cancelled: "해지됨",
  expired: "만료됨",
  free: "무료",
};

export function BillingPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as Status & { message?: string } }))
      .then(({ ok, body }) => {
        if (cancelled) {
          return;
        }
        if (!ok) {
          setMessage(body.message ?? "이용권 상태를 불러오지 못했습니다.");
          return;
        }
        setStatus(body);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("이용권 상태를 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upgrade = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const body = (await res.json()) as { checkoutUrl?: string; message?: string };
      if (res.ok && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      setMessage(body.message ?? "결제 페이지를 열지 못했습니다.");
    } catch {
      setMessage("결제 페이지를 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <section className="rounded border border-neutral-300 bg-white p-4 text-sm text-neutral-500">
        {message ?? "이용권 상태를 불러오는 중…"}
      </section>
    );
  }

  const { entitlement, plan, upgradeAvailable } = status;

  return (
    <div className="space-y-4">
      <section className="rounded border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">앱 이용권</h2>
          <span
            className={
              entitlement.canUseApp
                ? "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
                : "rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
            }
          >
            {STATUS_LABEL[entitlement.status] ?? entitlement.status}
          </span>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-600">플랜</dt>
            <dd>
              {plan.name}
              {plan.priceKrw > 0 ? ` · 월 ${plan.priceKrw.toLocaleString("ko-KR")}원 (VAT 별도)` : ""}
            </dd>
          </div>
          {entitlement.trialEndsAt ? (
            <div className="flex justify-between">
              <dt className="text-neutral-600">체험 종료</dt>
              <dd>{formatDateTime(entitlement.trialEndsAt)}</dd>
            </div>
          ) : null}
          {entitlement.currentPeriodEnd ? (
            <div className="flex justify-between">
              <dt className="text-neutral-600">현재 기간 만료</dt>
              <dd>
                {formatDateTime(entitlement.currentPeriodEnd)}
                {entitlement.cancelAtPeriodEnd ? " (해지 예약)" : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 text-xs text-neutral-600">{entitlement.message}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !upgradeAvailable}
            onClick={() => void upgrade()}
            type="button"
          >
            {busy ? "처리 중…" : "이용권 결제"}
          </button>
          {!upgradeAvailable ? (
            <span className="text-xs text-neutral-500">
              결제수단 준비 중입니다. 지금은 무료 플랜으로 모든 기능을 쓸 수 있습니다.
            </span>
          ) : null}
        </div>
        {message ? <p className="mt-2 text-xs font-semibold text-red-700">{message}</p> : null}
        <p className="mt-3 rounded bg-neutral-50 p-3 text-xs text-neutral-600">
          결제는 서버 웹훅의 서명 검증으로만 확정합니다. 브라우저의 성공 화면만으로 유료 처리하지
          않으며, 같은 결제 이벤트가 두 번 와도 한 번만 반영합니다.
        </p>
      </section>

      <UninstallPanel />
    </div>
  );
}

function UninstallPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const uninstall = async () => {
    if (
      !window.confirm(
        "이 사이트의 연동을 해제할까요? 다음 회차 청구가 중단되고 토큰이 삭제됩니다. 저장한 견적 문서는 삭제되지 않습니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/uninstall", { method: "POST" });
      if (!res.ok) {
        setMessage("연동 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setMessage("연동 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-red-200 bg-white p-4">
      <h2 className="text-sm font-bold text-red-800">연동 해제</h2>
      <p className="mt-2 text-xs text-neutral-600">
        아임웹 관리자에는 앱 해제 기능이 없어 이 앱에서 직접 해제합니다. 해제하면 토큰이 삭제되고
        다음 회차 청구가 중단됩니다. 결제 취소·환불과 문서 삭제는 별개이며, 문서 삭제는 요청 시
        처리합니다.
      </p>
      <button
        className="mt-3 rounded border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
        disabled={busy}
        onClick={() => void uninstall()}
        type="button"
      >
        {busy ? "해제 중…" : "연동 해제"}
      </button>
      {message ? <p className="mt-2 text-xs font-semibold text-red-700">{message}</p> : null}
    </section>
  );
}
