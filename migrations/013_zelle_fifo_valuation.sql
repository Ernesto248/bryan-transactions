ALTER TABLE public.account_outflow_movements
  ADD COLUMN fifo_method text NULL,
  ADD COLUMN fifo_valued_at timestamptz NULL,
  ADD COLUMN fifo_balance_before_usd numeric NULL,
  ADD COLUMN fifo_balance_after_usd numeric NULL,
  ADD COLUMN fifo_priced_usd numeric NULL,
  ADD COLUMN fifo_unpriced_usd numeric NULL,
  ADD COLUMN fifo_cost_cup numeric NULL,
  ADD COLUMN fifo_average_price numeric NULL,
  ADD COLUMN fifo_remaining_priced_usd numeric NULL,
  ADD COLUMN fifo_remaining_unpriced_usd numeric NULL,
  ADD COLUMN fifo_remaining_cost_cup numeric NULL,
  ADD COLUMN fifo_remaining_average_price numeric NULL,
  ADD CONSTRAINT account_outflow_fifo_snapshot_check CHECK (
    (fifo_method IS NULL
      AND fifo_valued_at IS NULL
      AND fifo_balance_before_usd IS NULL
      AND fifo_balance_after_usd IS NULL
      AND fifo_priced_usd IS NULL
      AND fifo_unpriced_usd IS NULL
      AND fifo_cost_cup IS NULL
      AND fifo_average_price IS NULL
      AND fifo_remaining_priced_usd IS NULL
      AND fifo_remaining_unpriced_usd IS NULL
      AND fifo_remaining_cost_cup IS NULL
      AND fifo_remaining_average_price IS NULL)
    OR
    (movement_type = 'wire'
      AND fifo_method = 'FIFO_PER_ACCOUNT'
      AND fifo_valued_at IS NOT NULL
      AND fifo_balance_before_usd >= 0
      AND fifo_balance_after_usd >= 0
      AND fifo_priced_usd >= 0
      AND fifo_unpriced_usd >= 0
      AND fifo_cost_cup >= 0
      AND fifo_remaining_priced_usd >= 0
      AND fifo_remaining_unpriced_usd >= 0
      AND fifo_remaining_cost_cup >= 0
      AND (fifo_priced_usd = 0 OR fifo_average_price IS NOT NULL)
      AND (fifo_remaining_priced_usd = 0 OR fifo_remaining_average_price IS NOT NULL))
  );
