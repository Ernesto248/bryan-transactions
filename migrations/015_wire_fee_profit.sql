ALTER TABLE public.account_outflow_movements
  ADD COLUMN wire_fee_usd numeric NULL,
  ADD COLUMN wire_profit_status text NULL,
  ADD COLUMN wire_profit_global_rate numeric NULL,
  ADD COLUMN wire_profit_fifo_cost_cup numeric NULL,
  ADD COLUMN wire_profit_cup numeric NULL,
  ADD COLUMN wire_profit_usd numeric NULL,
  ADD CONSTRAINT account_outflow_wire_profit_check CHECK (
    (wire_fee_usd IS NULL
      AND wire_profit_status IS NULL
      AND wire_profit_global_rate IS NULL
      AND wire_profit_fifo_cost_cup IS NULL
      AND wire_profit_cup IS NULL
      AND wire_profit_usd IS NULL)
    OR
    (movement_type = 'wire'
      AND wire_fee_usd >= 0
      AND wire_profit_status IN ('EXACT', 'ESTIMATED', 'UNAVAILABLE')
      AND wire_profit_global_rate > 0
      AND (
        (wire_profit_status = 'UNAVAILABLE'
          AND wire_profit_fifo_cost_cup IS NULL
          AND wire_profit_cup IS NULL
          AND wire_profit_usd IS NULL)
        OR
        (wire_profit_status IN ('EXACT', 'ESTIMATED')
          AND wire_profit_fifo_cost_cup >= 0
          AND wire_profit_cup IS NOT NULL
          AND wire_profit_usd IS NOT NULL)
      ))
  );
