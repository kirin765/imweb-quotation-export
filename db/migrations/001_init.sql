-- 앱 전용 스키마 001. 앱은 부팅 시 ensureSchema()로 같은 표를 `create table if not exists`로
-- 보장하므로, 이 파일은 DBA 검토·수동 프로비저닝·변경 이력용이다. 표는 앱 전용 접두사 imq_를 쓴다.
--
-- tenant 식별자는 아임웹 site-info로 검증한 site_code다. 모든 문서 조회에 site_code 조건을 건다.
-- unit_code는 site-info에서 고른 유닛이며(기본 KRW), 여러 유닛을 쓰는 사이트의 귀속 기준이다.

-- OAuth 토큰. unit_code/site_name/scope를 함께 둔다.
create table if not exists imq_tokens (
  site_code text primary key,
  unit_code text not null default '',
  unit_currency text not null default 'KRW',
  site_name text not null default '',
  access_token text not null,
  refresh_token text not null,
  scope text not null default '',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- 설치 상태.
create table if not exists imq_shops (
  site_code text primary key,
  unit_code text not null default '',
  site_name text not null default '',
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz
);

-- 공급자 표시 정보(사이트별 1건).
create table if not exists imq_settings (
  site_code text primary key,
  unit_code text not null default '',
  supplier jsonb not null,
  updated_at timestamptz not null default now()
);

-- 견적 초안. revision은 낙관적 동시 편집 감지용, version은 마지막 확정 버전이다.
create table if not exists imq_drafts (
  id uuid primary key,
  site_code text not null,
  unit_code text not null default '',
  document_number text not null,
  revision integer not null default 1,
  version integer not null default 0,
  recipient_company text not null default '',
  valid_until text not null default '',
  delivery_terms text not null default '',
  price_condition text not null default '',
  notes text not null default '',
  adjustment_description text,
  adjustment_amount bigint,
  supplier jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists imq_drafts_number_key
  on imq_drafts (site_code, unit_code, document_number);
create index if not exists imq_drafts_list_idx
  on imq_drafts (site_code, updated_at desc);

-- 초안 품목 행.
create table if not exists imq_items (
  id bigserial primary key,
  draft_id uuid not null,
  client_item_id text not null,
  row_order integer not null,
  item_code text not null default '',
  product_name text not null,
  option_name text not null default '',
  quantity integer not null,
  unit_price bigint not null
);
create index if not exists imq_items_draft_idx on imq_items (draft_id, row_order);

-- 확정 스냅샷. 확정 후 초안/설정을 바꿔도 이 문서는 바뀌지 않는다.
create table if not exists imq_versions (
  id uuid primary key,
  site_code text not null,
  unit_code text not null default '',
  draft_id uuid not null,
  document_number text not null,
  version integer not null,
  document jsonb not null,
  subtotal bigint not null,
  adjustment bigint not null,
  total bigint not null,
  confirmed_at timestamptz not null default now()
);
create unique index if not exists imq_versions_key
  on imq_versions (site_code, unit_code, document_number, version);
create index if not exists imq_versions_draft_idx
  on imq_versions (draft_id, version desc);

-- 감사 이벤트. 본문·수신처를 남기지 않고 사건·건수·상태만 남긴다.
create table if not exists imq_audit_events (
  id bigserial primary key,
  site_code text not null,
  draft_id uuid,
  version_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists imq_audit_events_idx
  on imq_audit_events (site_code, created_at desc);

-- 앱 이용권 구독 상태.
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
);

-- 결제 이벤트. (provider, event_id) 유니크가 중복 웹훅 멱등 처리의 최종 방어다.
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
);
create unique index if not exists imq_billing_events_key
  on imq_billing_events (provider, event_id);
create index if not exists imq_billing_events_month_idx
  on imq_billing_events (occurred_at);
