CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.banks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banks_pkey PRIMARY KEY (id),
  CONSTRAINT banks_name_key UNIQUE (name)
);

CREATE TABLE public.gmail_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gmail_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT gmail_accounts_account_name_key UNIQUE (account_name)
);

CREATE TABLE public.emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gmail_account_id uuid NOT NULL,
  bank_id uuid NULL,
  message_id text NOT NULL,
  thread_id text NULL,
  from_email text NULL,
  to_email text NULL,
  subject text NULL,
  received_at timestamptz NULL,
  snippet text NULL,
  raw_payload jsonb NULL,
  processed_label text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emails_pkey PRIMARY KEY (id),
  CONSTRAINT emails_gmail_account_id_message_id_key UNIQUE (gmail_account_id, message_id),
  CONSTRAINT emails_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT emails_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id) ON DELETE SET NULL
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id uuid NULL,
  gmail_account_id uuid NOT NULL,
  bank_id uuid NULL,
  actor_name text NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  confirmation_code text NULL,
  occurred_at timestamptz NULL,
  posted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE SET NULL,
  CONSTRAINT transactions_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT transactions_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX transactions_bank_confirmation_unique
  ON public.transactions (bank_id, confirmation_code)
  WHERE bank_id IS NOT NULL AND confirmation_code IS NOT NULL;

CREATE INDEX transactions_created_at_idx ON public.transactions (created_at DESC);
CREATE INDEX transactions_occurred_at_idx ON public.transactions (occurred_at DESC);
CREATE INDEX transactions_bank_id_idx ON public.transactions (bank_id);
CREATE INDEX transactions_gmail_account_id_idx ON public.transactions (gmail_account_id);
