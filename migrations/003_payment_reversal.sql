ALTER TABLE public.remesero_payments
  ADD COLUMN reverted_at timestamptz NULL,
  ADD COLUMN reverted_reason text NULL;

CREATE INDEX remesero_payments_active_by_remesero_idx
  ON public.remesero_payments (remesero_id, paid_at DESC)
  WHERE reverted_at IS NULL;

CREATE INDEX remesero_payments_reverted_at_idx
  ON public.remesero_payments (reverted_at);
