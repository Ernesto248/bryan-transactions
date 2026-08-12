ALTER TABLE public.remesero_payments
  ADD COLUMN deuda_antes_pago numeric NULL,
  ADD COLUMN deuda_despues_pago numeric NULL;

CREATE INDEX remesero_payments_cut_idx
  ON public.remesero_payments (remesero_id, paid_at DESC)
  WHERE reverted_at IS NULL;