ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_email_id_fkey;

ALTER TABLE public.transactions
  ALTER COLUMN email_id TYPE text USING email_id::text;

CREATE INDEX IF NOT EXISTS transactions_email_id_idx
  ON public.transactions (email_id);
