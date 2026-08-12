CREATE TABLE public.remeseros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  precio_actual numeric NOT NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remeseros_pkey PRIMARY KEY (id),
  CONSTRAINT remeseros_nombre_unique UNIQUE (nombre),
  CONSTRAINT remeseros_precio_actual_non_negative CHECK (precio_actual >= 0)
);

CREATE TABLE public.remesero_transaction_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  remesero_id uuid NOT NULL,
  amount_usd numeric NOT NULL,
  price_applied numeric NOT NULL,
  debt_amount numeric NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remesero_transaction_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT remesero_transaction_assignments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE,
  CONSTRAINT remesero_transaction_assignments_remesero_id_fkey FOREIGN KEY (remesero_id) REFERENCES public.remeseros(id) ON DELETE RESTRICT,
  CONSTRAINT remesero_transaction_assignments_amount_usd_non_negative CHECK (amount_usd >= 0),
  CONSTRAINT remesero_transaction_assignments_price_applied_non_negative CHECK (price_applied >= 0),
  CONSTRAINT remesero_transaction_assignments_debt_amount_non_negative CHECK (debt_amount >= 0)
);

CREATE TABLE public.remesero_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  remesero_id uuid NOT NULL,
  amount_paid numeric NOT NULL,
  note text NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remesero_payments_pkey PRIMARY KEY (id),
  CONSTRAINT remesero_payments_remesero_id_fkey FOREIGN KEY (remesero_id) REFERENCES public.remeseros(id) ON DELETE RESTRICT,
  CONSTRAINT remesero_payments_amount_paid_positive CHECK (amount_paid > 0)
);

CREATE INDEX remeseros_deleted_at_idx ON public.remeseros (deleted_at);
CREATE INDEX remesero_transaction_assignments_remesero_id_idx ON public.remesero_transaction_assignments (remesero_id);
CREATE INDEX remesero_transaction_assignments_assigned_at_idx ON public.remesero_transaction_assignments (assigned_at DESC);
CREATE INDEX remesero_payments_remesero_id_idx ON public.remesero_payments (remesero_id);
CREATE INDEX remesero_payments_paid_at_idx ON public.remesero_payments (paid_at DESC);

CREATE UNIQUE INDEX remesero_active_assignment_per_transaction_unique
  ON public.remesero_transaction_assignments (transaction_id)
  WHERE unassigned_at IS NULL;
