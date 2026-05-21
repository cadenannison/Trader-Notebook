-- 003: portfolios + trigger notes/grouping

-- Portfolios (named groups of alerts with a thesis)
create table portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  thesis     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portfolios enable row level security;
create policy "portfolios: own rows only" on portfolios
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_portfolios_user on portfolios(user_id);

-- Add notes + portfolio grouping to triggers
alter table triggers
  add column if not exists notes        text,
  add column if not exists portfolio_id uuid references portfolios(id) on delete set null;

create index idx_triggers_portfolio on triggers(portfolio_id);
