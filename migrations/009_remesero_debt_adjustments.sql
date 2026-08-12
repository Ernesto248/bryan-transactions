CREATE TABLE public.remesero_debt_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  remesero_id uuid NOT NULL,
  debt_before numeric NOT NULL,
  debt_after numeric NOT NULL,
  note text NULL,
  adjusted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT remesero_debt_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT remesero_debt_adjustments_remesero_id_fkey
    FOREIGN KEY (remesero_id)
    REFERENCES public.remeseros(id)
    ON DELETE RESTRICT
);

CREATE INDEX remesero_debt_adjustments_remesero_cut_idx
  ON public.remesero_debt_adjustments (remesero_id, adjusted_at DESC);
