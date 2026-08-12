ALTER TABLE public.remeseros
  ADD COLUMN IF NOT EXISTS deuda_actual numeric NOT NULL DEFAULT 0;

UPDATE public.remeseros r
SET deuda_actual =
  COALESCE(d.total_debt, 0) - COALESCE(p.total_paid, 0),
  updated_at = now()
FROM (
  SELECT remesero_id, SUM(debt_amount) AS total_debt
  FROM public.remesero_transaction_assignments
  WHERE unassigned_at IS NULL
  GROUP BY remesero_id
) d
FULL OUTER JOIN (
  SELECT remesero_id, SUM(amount_paid) AS total_paid
  FROM public.remesero_payments
  WHERE reverted_at IS NULL
  GROUP BY remesero_id
) p
  ON p.remesero_id = d.remesero_id
WHERE r.id = COALESCE(d.remesero_id, p.remesero_id);
