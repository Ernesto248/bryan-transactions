CREATE TABLE public.finance_state (
  id smallint NOT NULL DEFAULT 1,
  cash_usd numeric NOT NULL DEFAULT 0,
  cash_cup numeric NOT NULL DEFAULT 0,
  usd_cup_rate numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_state_pkey PRIMARY KEY (id),
  CONSTRAINT finance_state_singleton CHECK (id = 1),
  CONSTRAINT finance_state_cash_usd_non_negative CHECK (cash_usd >= 0),
  CONSTRAINT finance_state_cash_cup_non_negative CHECK (cash_cup >= 0),
  CONSTRAINT finance_state_rate_positive CHECK (usd_cup_rate IS NULL OR usd_cup_rate > 0)
);

INSERT INTO public.finance_state (id, cash_usd, cash_cup, usd_cup_rate)
VALUES (1, 0, 0, NULL);

CREATE TABLE public.finance_state_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  field_name text NOT NULL CHECK (field_name IN ('cashUsd', 'cashCup', 'usdCupRate')),
  previous_value numeric NULL,
  new_value numeric NULL,
  note text NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_state_changes_pkey PRIMARY KEY (id)
);

CREATE INDEX finance_state_changes_changed_at_idx
  ON public.finance_state_changes (changed_at DESC);

CREATE TABLE public.finance_counterparties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_counterparties_pkey PRIMARY KEY (id),
  CONSTRAINT finance_counterparties_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX finance_counterparties_active_name_unique
  ON public.finance_counterparties (lower(name))
  WHERE archived_at IS NULL;

CREATE TABLE public.finance_debt_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  counterparty_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'CUP')),
  movement_type text NOT NULL CHECK (
    movement_type IN ('RECEIVABLE', 'RECEIVED', 'PAYABLE', 'PAID')
  ),
  amount numeric NOT NULL CHECK (amount > 0),
  note text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz NULL,
  reverted_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_debt_movements_pkey PRIMARY KEY (id),
  CONSTRAINT finance_debt_movements_counterparty_id_fkey
    FOREIGN KEY (counterparty_id)
    REFERENCES public.finance_counterparties(id)
    ON DELETE RESTRICT
);

CREATE INDEX finance_debt_movements_counterparty_idx
  ON public.finance_debt_movements (counterparty_id, occurred_at DESC);

CREATE INDEX finance_debt_movements_active_idx
  ON public.finance_debt_movements (counterparty_id, currency)
  WHERE reverted_at IS NULL;
