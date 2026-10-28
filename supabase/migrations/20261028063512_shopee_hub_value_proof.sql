ALTER TABLE public.management_actions
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
 ADD COLUMN IF NOT EXISTS owner_email text,
 ADD COLUMN IF NOT EXISTS due_date date,
 ADD COLUMN IF NOT EXISTS created_by text,
 ADD COLUMN IF NOT EXISTS approved_by text,
 ADD COLUMN IF NOT EXISTS approved_at timestamptz,
 ADD COLUMN IF NOT EXISTS client_visible_at timestamptz,
 ADD COLUMN IF NOT EXISTS evidence_url text,
 ADD COLUMN IF NOT EXISTS result_summary text,
 ADD COLUMN IF NOT EXISTS result_type text,
 ADD COLUMN IF NOT EXISTS result_amount numeric(18,2),
 ADD COLUMN IF NOT EXISTS result_currency text,
 ADD COLUMN IF NOT EXISTS result_source text,
 ADD COLUMN IF NOT EXISTS result_verified_at timestamptz,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.management_actions ADD CONSTRAINT management_actions_tenant_store_fk FOREIGN KEY (tenant_id,store_id) REFERENCES public.stores(tenant_id,id);
ALTER TABLE public.management_actions ADD CONSTRAINT management_actions_status_check CHECK (status IN ('draft','approved','in_progress','completed'));
ALTER TABLE public.management_actions ADD CONSTRAINT management_actions_result_type_check CHECK (result_type IS NULL OR result_type IN ('verified_saving','sales_change','unattributed','risk_reduction'));
CREATE TABLE public.management_action_events (
 id bigserial PRIMARY KEY,
 action_id bigint NOT NULL REFERENCES public.management_actions(id),
 tenant_id text NOT NULL REFERENCES public.tenants(id),
 store_id text NOT NULL REFERENCES public.stores(id),
 event_type text NOT NULL CHECK (event_type IN ('created','approved','progress','result')),
 actor_email text NOT NULL,
 detail jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT management_action_events_tenant_store_fk FOREIGN KEY (tenant_id,store_id) REFERENCES public.stores(tenant_id,id)
);
CREATE INDEX management_action_events_action_idx ON public.management_action_events(action_id,created_at);
CREATE TABLE public.store_monthly_financials (
 id bigserial PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES public.tenants(id),
 store_id text NOT NULL REFERENCES public.stores(id),
 month date NOT NULL CHECK (extract(day from month)=1),
 currency text NOT NULL,
 net_sales numeric(18,2), platform_fees numeric(18,2), ad_spend numeric(18,2),
 seller_discounts numeric(18,2), goods_cost numeric(18,2), fulfilment_cost numeric(18,2),
 source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
 verified_by text, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT store_monthly_financials_tenant_store_fk FOREIGN KEY (tenant_id,store_id) REFERENCES public.stores(tenant_id,id),
 CONSTRAINT store_monthly_financials_unique_month_idx UNIQUE (store_id,month),
 CONSTRAINT store_monthly_financials_cost_nonnegative CHECK (
   (platform_fees IS NULL OR platform_fees>=0) AND (ad_spend IS NULL OR ad_spend>=0)
   AND (seller_discounts IS NULL OR seller_discounts>=0) AND (goods_cost IS NULL OR goods_cost>=0)
   AND (fulfilment_cost IS NULL OR fulfilment_cost>=0))
);
CREATE TABLE public.department_monthly_financials (
 id bigserial PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES public.tenants(id),
 store_id text NOT NULL REFERENCES public.stores(id),
 month date NOT NULL CHECK (extract(day from month)=1),
 currency text NOT NULL, project_kind text NOT NULL CHECK (project_kind IN ('external','internal')),
 cash_revenue numeric(18,2), labor_cost numeric(18,2), tool_cost numeric(18,2),
 outsourced_cost numeric(18,2), other_cost numeric(18,2), internal_value numeric(18,2),
 hours numeric(12,2), source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
 verified_by text, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT department_monthly_financials_tenant_store_fk FOREIGN KEY (tenant_id,store_id) REFERENCES public.stores(tenant_id,id),
 CONSTRAINT department_monthly_financials_unique_month_idx UNIQUE (store_id,month),
 CONSTRAINT department_monthly_financials_nonnegative CHECK (
   (cash_revenue IS NULL OR cash_revenue>=0) AND (labor_cost IS NULL OR labor_cost>=0)
   AND (tool_cost IS NULL OR tool_cost>=0) AND (outsourced_cost IS NULL OR outsourced_cost>=0)
   AND (other_cost IS NULL OR other_cost>=0) AND (internal_value IS NULL OR internal_value>=0)
   AND (hours IS NULL OR hours>=0))
);
ALTER TABLE public.management_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_monthly_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_monthly_financials ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.management_actions TO service_role;
GRANT SELECT,INSERT ON public.management_action_events TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.store_monthly_financials,public.department_monthly_financials TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
