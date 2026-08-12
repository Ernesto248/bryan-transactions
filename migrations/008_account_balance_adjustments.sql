ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS incoming_adjustment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outgoing_adjustment numeric NOT NULL DEFAULT 0;

UPDATE public.gmail_accounts
SET
  incoming_adjustment = CASE account_name
    WHEN 'Lejocky Group LLc' THEN -49940.90
    WHEN 'LPC INC' THEN -27235
    ELSE incoming_adjustment
  END,
  outgoing_adjustment = CASE account_name
    WHEN 'Lejocky Group LLc' THEN -36611
    WHEN 'LPC INC' THEN -40365
    ELSE outgoing_adjustment
  END
WHERE account_name IN ('Lejocky Group LLc', 'LPC INC');