import postgres from "postgres";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled";

export type SubscriptionRecord = {
  siteCode: string;
  planCode: string;
  status: SubscriptionStatus;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
};

export type BillingEventType =
  | "subscription.activated"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "payment.succeeded"
  | "payment.failed"
  | "refund.succeeded";

export type BillingEventRecord = {
  provider: string;
  eventId: string;
  siteCode: string;
  type: BillingEventType;
  /** 공급가액 기준 금액(원). 환불은 양수로 저장하고 type으로 부호를 해석한다. */
  amount: number;
  currency: string;
  occurredAt: string;
  /** 귀속: imweb | direct | existing — 정산 대상 구분. 미상이면 unknown. */
  attribution: string;
  payload: Record<string, unknown>;
};

export interface BillingStore {
  kind: "postgres" | "memory";
  getSubscription(siteCode: string): Promise<SubscriptionRecord | null>;
  upsertSubscription(record: SubscriptionRecord): Promise<void>;
  /** 중복 이벤트를 조용히 버리지 않고 duplicate로 알린다(멱등 처리의 근거). */
  recordEvent(event: BillingEventRecord): Promise<{ duplicate: boolean }>;
  listEvents(month: string): Promise<BillingEventRecord[]>;
  listSubscriptions(): Promise<SubscriptionRecord[]>;
}

const memSubs = new Map<string, SubscriptionRecord>();
const memEvents: BillingEventRecord[] = [];

const memoryStore: BillingStore = {
  kind: "memory",
  async getSubscription(siteCode) {
    return memSubs.get(siteCode) ?? null;
  },
  async upsertSubscription(record) {
    memSubs.set(record.siteCode, record);
  },
  async recordEvent(event) {
    const exists = memEvents.some((e) => e.provider === event.provider && e.eventId === event.eventId);
    if (exists) {
      return { duplicate: true };
    }
    memEvents.push(event);
    return { duplicate: false };
  },
  async listEvents(month) {
    return memEvents.filter((e) => e.occurredAt.startsWith(month));
  },
  async listSubscriptions() {
    return [...memSubs.values()];
  },
};

type SubRow = {
  site_code: string;
  plan_code: string;
  status: string;
  provider: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  updated_at: Date;
};

type EventRow = {
  provider: string;
  event_id: string;
  site_code: string;
  type: string;
  amount: string;
  currency: string;
  occurred_at: Date;
  attribution: string;
  payload: Record<string, unknown>;
};

function pgStore(url: string): BillingStore {
  const sql = postgres(url, { max: 1 });
  let ready: Promise<void> | null = null;
  const init = () =>
    (ready ??= (async () => {
      await sql`
        create table if not exists imq_billing_subscriptions (
          site_code text primary key,
          plan_code text not null,
          status text not null,
          provider text not null default '',
          provider_customer_id text not null default '',
          provider_subscription_id text not null default '',
          trial_ends_at timestamptz,
          current_period_end timestamptz,
          cancel_at_period_end boolean not null default false,
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists imq_billing_events (
          id bigserial primary key,
          provider text not null,
          event_id text not null,
          site_code text not null,
          type text not null,
          amount bigint not null default 0,
          currency text not null default 'KRW',
          occurred_at timestamptz not null,
          attribution text not null default 'unknown',
          payload jsonb not null default '{}'::jsonb,
          received_at timestamptz not null default now()
        )`;
      // (provider, event_id) 유니크가 중복 웹훅 멱등 처리의 최종 방어다.
      await sql`
        create unique index if not exists imq_billing_events_key
          on imq_billing_events (provider, event_id)`;
      await sql`
        create index if not exists imq_billing_events_month_idx
          on imq_billing_events (occurred_at)`;
    })().then(() => undefined));

  const toSub = (row: SubRow): SubscriptionRecord => ({
    siteCode: row.site_code,
    planCode: row.plan_code,
    status: row.status as SubscriptionStatus,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    trialEndsAt: row.trial_ends_at ? row.trial_ends_at.toISOString() : null,
    currentPeriodEnd: row.current_period_end ? row.current_period_end.toISOString() : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    updatedAt: row.updated_at.toISOString(),
  });

  return {
    kind: "postgres",
    async getSubscription(siteCode) {
      await init();
      const [row] = await sql<SubRow[]>`select * from imq_billing_subscriptions where site_code = ${siteCode}`;
      return row ? toSub(row) : null;
    },
    async upsertSubscription(record) {
      await init();
      await sql`
        insert into imq_billing_subscriptions
          (site_code, plan_code, status, provider, provider_customer_id, provider_subscription_id,
           trial_ends_at, current_period_end, cancel_at_period_end)
        values (
          ${record.siteCode}, ${record.planCode}, ${record.status}, ${record.provider},
          ${record.providerCustomerId}, ${record.providerSubscriptionId}, ${record.trialEndsAt},
          ${record.currentPeriodEnd}, ${record.cancelAtPeriodEnd}
        )
        on conflict (site_code) do update set
          plan_code = excluded.plan_code,
          status = excluded.status,
          provider = excluded.provider,
          provider_customer_id = excluded.provider_customer_id,
          provider_subscription_id = excluded.provider_subscription_id,
          trial_ends_at = excluded.trial_ends_at,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          updated_at = now()`;
    },
    async recordEvent(event) {
      await init();
      const rows = await sql`
        insert into imq_billing_events
          (provider, event_id, site_code, type, amount, currency, occurred_at, attribution, payload)
        values (
          ${event.provider}, ${event.eventId}, ${event.siteCode}, ${event.type}, ${event.amount},
          ${event.currency}, ${event.occurredAt}, ${event.attribution},
          ${sql.json(event.payload as unknown as postgres.JSONValue)}
        )
        on conflict (provider, event_id) do nothing
        returning id`;
      return { duplicate: rows.length === 0 };
    },
    async listEvents(month) {
      await init();
      const rows = await sql<EventRow[]>`
        select provider, event_id, site_code, type, amount::text as amount, currency,
               occurred_at, attribution, payload
        from imq_billing_events
        where to_char(occurred_at, 'YYYY-MM') = ${month}
        order by occurred_at asc`;
      return rows.map((row) => ({
        provider: row.provider,
        eventId: row.event_id,
        siteCode: row.site_code,
        type: row.type as BillingEventType,
        amount: Number.parseInt(row.amount, 10) || 0,
        currency: row.currency,
        occurredAt: row.occurred_at.toISOString(),
        attribution: row.attribution,
        payload: row.payload,
      }));
    },
    async listSubscriptions() {
      await init();
      const rows = await sql<SubRow[]>`select * from imq_billing_subscriptions`;
      return rows.map(toSub);
    },
  };
}

export const billingStore: BillingStore = process.env.DATABASE_URL
  ? pgStore(process.env.DATABASE_URL)
  : memoryStore;

export const billingStoreKind = () => billingStore.kind;
