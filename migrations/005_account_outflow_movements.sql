CREATE TABLE public.account_outflow_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('wire', 'expense')),
  amount numeric NOT NULL CHECK (amount > 0),
  note text NULL,
  reverted_at timestamptz NULL,
  reverted_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_outflow_movements_pkey PRIMARY KEY (id),
  CONSTRAINT account_outflow_movements_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE
);

CREATE INDEX account_outflow_movements_account_idx
  ON public.account_outflow_movements (gmail_account_id, created_at DESC);

CREATE INDEX account_outflow_movements_active_idx
  ON public.account_outflow_movements (gmail_account_id)
  WHERE reverted_at IS NULL;
