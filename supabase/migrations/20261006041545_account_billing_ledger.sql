-- Shopee Hub billing ledger. Apply only to an isolated test database until release approval.
-- No inferred fees, receipts, roster rows or commercial terms are seeded here.
create table public.account_billing_cycles (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  statement_month date not null check (extract(day from statement_month)=1),
  invoice_month date not null check (extract(day from invoice_month)=1),
  service_period_start date, service_period_end date,
  updated_at timestamptz not null default now(),
  unique(tenant_id,id), unique(tenant_id,invoice_month,statement_month),
  check ((service_period_start is null and service_period_end is null) or
    (service_period_start is not null and service_period_end is not null and service_period_end>=service_period_start))
);
create table public.account_store_terms (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  roster_key text not null, roster_project text not null, legal_entity text not null,
  store_id text, project_id text, currency text not null check(currency in ('MYR','SGD')),
  rate_version text not null, eligibility_candidate boolean not null default false,
  confirmed boolean not null default false, fee_basis text, tax_rate numeric(8,6),
  commercial_terms jsonb, confirmed_reference jsonb,
  effective_from date not null, effective_to date,
  source_reference jsonb not null, raw_roster jsonb not null,
  updated_at timestamptz not null default now(), unique(tenant_id,id),
  unique(tenant_id,roster_key,effective_from),
  foreign key(tenant_id,store_id) references public.stores(tenant_id,id),
  check(effective_to is null or effective_to>=effective_from),
  check(tax_rate is null or tax_rate between 0 and 1),
  check(not confirmed or (store_id is not null and fee_basis is not null and tax_rate is not null and commercial_terms is not null and confirmed_reference is not null))
);
create table public.account_assessments (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  cycle_id uuid not null, term_id uuid not null,
  expected_net_fee numeric(18,2), status text not null default 'pending_statement'
    check(status in ('pending_mapping','pending_terms','pending_statement','verified')),
  statement_reference jsonb, assessment_reference jsonb,
  updated_at timestamptz not null default now(), unique(tenant_id,id), unique(tenant_id,cycle_id,term_id),
  foreign key(tenant_id,cycle_id) references public.account_billing_cycles(tenant_id,id),
  foreign key(tenant_id,term_id) references public.account_store_terms(tenant_id,id),
  check(expected_net_fee is null or expected_net_fee>=0),
  check((status='verified' and expected_net_fee is not null and statement_reference is not null and assessment_reference is not null)
    or (status<>'verified' and expected_net_fee is null))
);
create table public.account_invoices (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  assessment_id uuid not null, invoice_number text not null, invoice_date date not null, due_date date,
  net_amount numeric(18,2) not null check(net_amount>=0), tax_amount numeric(18,2) not null check(tax_amount>=0),
  gross_amount numeric(18,2) not null check(gross_amount=net_amount+tax_amount),
  credit_amount numeric(18,2) not null default 0 check(credit_amount>=0 and credit_amount<=gross_amount),
  credit_reference jsonb, source_reference jsonb not null,
  status text not null default 'issued' check(status in ('issued','void')),
  updated_at timestamptz not null default now(), unique(tenant_id,id), unique(tenant_id,invoice_number),
  foreign key(tenant_id,assessment_id) references public.account_assessments(tenant_id,id),
  check(credit_amount=0 or credit_reference is not null)
);
create table public.account_invoice_lines (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  invoice_id uuid not null, line_number integer not null check(line_number>0),
  kind text not null check(kind in ('service','setup','additional','tax','credit')),
  description text not null, amount numeric(18,2) not null check(amount>=0), source_reference jsonb not null,
  unique(tenant_id,invoice_id,line_number),
  foreign key(tenant_id,invoice_id) references public.account_invoices(tenant_id,id)
);
create table public.account_receipts (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  external_key text not null, collection_date date not null,
  currency text not null check(currency in ('MYR','SGD')),
  amount numeric(18,2) not null check(amount>0), kind text not null check(kind in ('receipt','refund')),
  status text not null default 'verified' check(status in ('verified','void')),
  source_reference jsonb not null, updated_at timestamptz not null default now(),
  unique(tenant_id,id), unique(tenant_id,external_key)
);
create table public.account_receipt_allocations (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  receipt_id uuid not null, invoice_id uuid not null, amount numeric(18,2) not null check(amount>0),
  updated_at timestamptz not null default now(), unique(tenant_id,receipt_id,invoice_id),
  foreign key(tenant_id,receipt_id) references public.account_receipts(tenant_id,id),
  foreign key(tenant_id,invoice_id) references public.account_invoices(tenant_id,id)
);
create table public.account_audit_log (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  actor_email text not null, action text not null, record_type text not null, record_id uuid not null,
  before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create index account_cycles_month_idx on public.account_billing_cycles(tenant_id,invoice_month);
create index account_terms_effective_idx on public.account_store_terms(tenant_id,effective_from,effective_to);
create index account_assessments_cycle_idx on public.account_assessments(tenant_id,cycle_id);
create index account_invoices_assessment_idx on public.account_invoices(tenant_id,assessment_id);
create index account_receipts_date_idx on public.account_receipts(tenant_id,collection_date);
create index account_allocations_invoice_idx on public.account_receipt_allocations(tenant_id,invoice_id);
-- Financial data is available only to the server, which verifies active Super Admin and tenant.
-- No anon/authenticated grants or policies; clients cannot query the ledger directly.
do $$ declare t text; begin
  foreach t in array array['account_billing_cycles','account_store_terms','account_assessments','account_invoices',
    'account_invoice_lines','account_receipts','account_receipt_allocations','account_audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
end $$;
-- Writes are intentionally not granted to the application until a validated ingestion flow is added.
