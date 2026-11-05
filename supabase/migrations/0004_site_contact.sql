-- 0004: canal de contato, reclamação, privacidade e denúncia do site institucional BLACK OPS (BO-GOV-01 item 8, BO-POL-06)
create table if not exists public.site_messages (
  id          bigint generated always as identity primary key,
  protocol    text not null unique,
  kind        text not null check (kind in ('contato','reclamacao','privacidade','denuncia')),
  anonymous   boolean not null default false,
  name        text null check (char_length(name) <= 160),
  email       text null check (char_length(email) <= 200),
  phone       text null check (char_length(phone) <= 40),
  message     text not null check (char_length(message) between 10 and 5000),
  ip_hash     text null,
  status      text not null default 'novo' check (status in ('novo','em_analise','respondido','encerrado')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz null
);
alter table public.site_messages enable row level security;
revoke all on public.site_messages from anon, authenticated;
create index if not exists site_messages_kind_created on public.site_messages (kind, created_at desc);
do $$ begin
  if exists (select 1 from pg_proc where proname = 'audit_row') then
    execute 'drop trigger if exists site_messages_audit on public.site_messages';
    execute 'create trigger site_messages_audit after insert or update on public.site_messages for each row execute function public.audit_row(''protocol'')';
  end if;
end $$;
