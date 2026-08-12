CREATE TABLE public.finance_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  currency text NOT NULL CHECK (currency IN ('USD', 'CUP')),
  amount numeric NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  balance_before numeric NOT NULL CHECK (balance_before >= 0),
  balance_after numeric NOT NULL CHECK (balance_after >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT finance_expenses_description_not_blank
    CHECK (length(trim(description)) > 0),
  CONSTRAINT finance_expenses_balance_consistent
    CHECK (balance_after = balance_before - amount)
);

CREATE INDEX finance_expenses_occurred_at_idx
  ON public.finance_expenses (occurred_at DESC, created_at DESC);
