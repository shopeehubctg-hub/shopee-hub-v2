-- Preserve unknown late-month values as NULL; do not infer from early or Campaign.
ALTER TABLE public.store_voucher_presets
 ADD COLUMN late_month_average numeric(5,2)
 CHECK (late_month_average BETWEEN 0 AND 100);
