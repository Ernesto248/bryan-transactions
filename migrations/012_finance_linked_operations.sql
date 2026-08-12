ALTER TABLE public.finance_state
  DROP CONSTRAINT IF EXISTS finance_state_cash_usd_non_negative,
  DROP CONSTRAINT IF EXISTS finance_state_cash_cup_non_negative;

ALTER TABLE public.finance_expenses
  DROP CONSTRAINT IF EXISTS finance_expenses_balance_before_check,
  DROP CONSTRAINT IF EXISTS finance_expenses_balance_after_check;

CREATE TABLE public.finance_cash_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  currency text NOT NULL CHECK (currency IN ('USD', 'CUP')),
  signed_amount numeric NOT NULL CHECK (signed_amount <> 0),
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  operation_type text NOT NULL CHECK (
    operation_type IN ('EXTERNAL_DEBT', 'REMESERO_PAYMENT', 'CURRENCY_EXCHANGE')
  ),
  operation_id uuid NOT NULL,
  reversal_of_id uuid NULL,
  note text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_cash_movements_pkey PRIMARY KEY (id),
  CONSTRAINT finance_cash_movements_balance_consistent
    CHECK (balance_after = balance_before + signed_amount),
  CONSTRAINT finance_cash_movements_reversal_of_id_fkey
    FOREIGN KEY (reversal_of_id)
    REFERENCES public.finance_cash_movements(id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX finance_cash_movements_original_unique
  ON public.finance_cash_movements (operation_type, operation_id, currency)
  WHERE reversal_of_id IS NULL;

CREATE UNIQUE INDEX finance_cash_movements_reversal_unique
  ON public.finance_cash_movements (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE INDEX finance_cash_movements_occurred_at_idx
  ON public.finance_cash_movements (occurred_at DESC, created_at DESC);

ALTER TABLE public.finance_debt_movements
  DROP CONSTRAINT IF EXISTS finance_debt_movements_movement_type_check,
  DROP CONSTRAINT IF EXISTS finance_debt_movements_amount_check,
  ADD COLUMN signed_delta numeric NULL,
  ADD COLUMN balance_before numeric NULL,
  ADD COLUMN balance_after numeric NULL,
  ADD COLUMN cash_movement_id uuid NULL,
  ADD COLUMN source_type text NULL,
  ADD COLUMN source_id uuid NULL,
  ADD CONSTRAINT finance_debt_movements_movement_type_check CHECK (
    movement_type IN (
      'RECEIVABLE', 'RECEIVED', 'PAYABLE', 'PAID',
      'SET_RECEIVABLE', 'SET_PAYABLE'
    )
  ),
  ADD CONSTRAINT finance_debt_movements_amount_check CHECK (
    (movement_type IN ('SET_RECEIVABLE', 'SET_PAYABLE') AND amount >= 0)
    OR
    (movement_type NOT IN ('SET_RECEIVABLE', 'SET_PAYABLE') AND amount > 0)
  ),
  ADD CONSTRAINT finance_debt_movements_snapshot_consistent CHECK (
    signed_delta IS NULL
    OR (balance_before IS NOT NULL AND balance_after = balance_before + signed_delta)
  ),
  ADD CONSTRAINT finance_debt_movements_cash_movement_id_fkey
    FOREIGN KEY (cash_movement_id)
    REFERENCES public.finance_cash_movements(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT finance_debt_movements_source_type_check
    CHECK (source_type IS NULL OR source_type = 'WIRE');

CREATE UNIQUE INDEX finance_debt_movements_cash_movement_unique
  ON public.finance_debt_movements (cash_movement_id)
  WHERE cash_movement_id IS NOT NULL;

CREATE UNIQUE INDEX finance_debt_movements_source_unique
  ON public.finance_debt_movements (source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.remesero_payments
  ADD COLUMN cash_movement_id uuid NULL,
  ADD CONSTRAINT remesero_payments_cash_movement_id_fkey
    FOREIGN KEY (cash_movement_id)
    REFERENCES public.finance_cash_movements(id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX remesero_payments_cash_movement_unique
  ON public.remesero_payments (cash_movement_id)
  WHERE cash_movement_id IS NOT NULL;

CREATE TABLE public.finance_currency_exchanges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('USD_TO_CUP', 'CUP_TO_USD')),
  source_amount numeric NOT NULL CHECK (source_amount > 0),
  rate numeric NOT NULL CHECK (rate > 0),
  target_amount numeric NOT NULL CHECK (target_amount > 0),
  note text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz NULL,
  reverted_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_currency_exchanges_pkey PRIMARY KEY (id)
);

CREATE INDEX finance_currency_exchanges_occurred_at_idx
  ON public.finance_currency_exchanges (occurred_at DESC, created_at DESC);

ALTER TABLE public.account_outflow_movements
  ADD COLUMN counterparty_id uuid NULL,
  ADD COLUMN settlement_currency text NULL,
  ADD COLUMN conversion_rate numeric NULL,
  ADD COLUMN fee_percent numeric NULL,
  ADD COLUMN debt_amount numeric NULL,
  ADD COLUMN finance_debt_movement_id uuid NULL,
  ADD CONSTRAINT account_outflow_counterparty_id_fkey
    FOREIGN KEY (counterparty_id)
    REFERENCES public.finance_counterparties(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT account_outflow_debt_movement_id_fkey
    FOREIGN KEY (finance_debt_movement_id)
    REFERENCES public.finance_debt_movements(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT account_outflow_settlement_currency_check
    CHECK (settlement_currency IS NULL OR settlement_currency IN ('USD', 'CUP')),
  ADD CONSTRAINT account_outflow_wire_finance_check CHECK (
    (counterparty_id IS NULL AND settlement_currency IS NULL
      AND conversion_rate IS NULL AND fee_percent IS NULL
      AND debt_amount IS NULL AND finance_debt_movement_id IS NULL)
    OR
    (movement_type = 'wire' AND counterparty_id IS NOT NULL
      AND debt_amount > 0 AND finance_debt_movement_id IS NOT NULL
      AND (
        (settlement_currency = 'CUP' AND conversion_rate > 0 AND fee_percent IS NULL)
        OR
        (settlement_currency = 'USD' AND fee_percent >= 0 AND conversion_rate IS NULL)
      ))
  );

CREATE UNIQUE INDEX account_outflow_debt_movement_unique
  ON public.account_outflow_movements (finance_debt_movement_id)
  WHERE finance_debt_movement_id IS NOT NULL;

CREATE INDEX account_outflow_counterparty_idx
  ON public.account_outflow_movements (counterparty_id, created_at DESC)
  WHERE counterparty_id IS NOT NULL;
