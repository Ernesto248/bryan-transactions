ALTER TABLE public.gmail_accounts
  ADD COLUMN owner_fee_percent numeric NULL,
  ADD CONSTRAINT gmail_accounts_owner_fee_percent_check CHECK (owner_fee_percent >= 0 AND owner_fee_percent <= 100);

CREATE TABLE public.gmail_account_owner_fee_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE RESTRICT,
  previous_percent numeric NULL,
  new_percent numeric NOT NULL,
  note text NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gmail_account_owner_fee_changes_percent_check CHECK (new_percent >= 0 AND new_percent <= 100)
);

CREATE INDEX gmail_account_owner_fee_changes_account_changed_idx
  ON public.gmail_account_owner_fee_changes(gmail_account_id, changed_at DESC);

ALTER TABLE public.account_outflow_movements
  ADD COLUMN wire_owner_fee_percent numeric NULL,
  ADD COLUMN wire_owner_fee_amount numeric NULL,
  ADD COLUMN wire_owner_fee_cup numeric NULL,
  ADD COLUMN wire_owner_fee_usd numeric NULL,
  ADD COLUMN wire_net_profit_cup numeric NULL,
  ADD COLUMN wire_net_profit_usd numeric NULL,
  ADD CONSTRAINT account_outflow_wire_owner_fee_snapshot_check CHECK (
    (wire_owner_fee_percent IS NULL AND wire_owner_fee_amount IS NULL
      AND wire_owner_fee_cup IS NULL AND wire_owner_fee_usd IS NULL
      AND wire_net_profit_cup IS NULL AND wire_net_profit_usd IS NULL)
    OR
    (movement_type = 'wire' AND wire_owner_fee_percent BETWEEN 0 AND 100
      AND wire_owner_fee_amount >= 0 AND wire_owner_fee_cup >= 0 AND wire_owner_fee_usd >= 0
      AND ((wire_profit_status = 'UNAVAILABLE' AND wire_net_profit_cup IS NULL AND wire_net_profit_usd IS NULL)
        OR (wire_profit_status IN ('EXACT', 'ESTIMATED') AND wire_net_profit_cup IS NOT NULL AND wire_net_profit_usd IS NOT NULL)))
  );
