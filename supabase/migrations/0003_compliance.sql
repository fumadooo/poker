-- 0003_compliance.sql — controles técnicos de PLD/FTP e KYC.
-- Fonte das regras: compliance/politicas/BO-POL-01_PLD-FTP.md (itens 7, 9, 10), BO-POL-02_KYC.md (item 7),
-- BO-POL-03_Cadastro-de-Clientes.md (status cadastrais, item 7). Evidência: run/C1_evidence.md.
-- Idempotente: pode rodar mais de uma vez (create if not exists + drop/add de constraints nomeadas).
--
-- CPF nunca é gravado em claro: cpf_hash = HMAC-SHA256(pepper, 11 dígitos) em hex, calculado pela aplicação
-- (tools/compliance/common.py) com o pepper COMPLIANCE_CPF_PEPPER, que vive só no .env / env da Vercel.

create extension if not exists pgcrypto;

-- ===========================================================================
-- 1. audit_log: append-only. UPDATE / DELETE / TRUNCATE bloqueados por trigger para qualquer papel
--    (inclusive service_role e postgres). Clientes não enxergam a tabela.
-- ===========================================================================
create table if not exists public.audit_log (
  id        bigserial primary key,
  ts        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  entity    text not null,
  entity_id text null,
  before    jsonb null,
  after     jsonb null
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, ts);

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDIT_LOG_APPEND_ONLY: % em audit_log é proibido', tg_op using errcode = 'P0001';
end;
$$;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.compliance_actor()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.actor', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''),
    current_user::text)
$$;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id     text  := coalesce(v_after ->> tg_argv[0], v_before ->> tg_argv[0]);
begin
  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (public.compliance_actor(), tg_op, tg_table_name, v_id, v_before, v_after);
  return coalesce(new, old);
end;
$$;

-- dias úteis (seg–sex; feriados não descontados nesta versão)
create or replace function public.compliance_add_business_days(p_from timestamptz, p_days int)
returns timestamptz
language plpgsql
stable
as $$
declare
  v timestamptz := p_from;
  n int := 0;
begin
  while n < p_days loop
    v := v + interval '1 day';
    if extract(isodow from v at time zone 'America/Sao_Paulo') < 6 then
      n := n + 1;
    end if;
  end loop;
  return v;
end;
$$;

-- prazo de análise (BO-POL-01 10.1): crítica imediato; alta 5 dias úteis; média 15 dias úteis; baixa 30 dias;
-- nenhum alerta passa de 45 dias.
create or replace function public.aml_due_at(p_severity text, p_from timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select least(p_from + interval '45 days',
    case p_severity
      when 'critical' then p_from
      when 'high'     then public.compliance_add_business_days(p_from, 5)
      when 'medium'   then public.compliance_add_business_days(p_from, 15)
      else p_from + interval '30 days'
    end)
$$;

-- ===========================================================================
-- 2. kyc_profiles — status cadastral (BO-POL-03), nível 0–3 e limites (BO-POL-02 item 7), risco (BO-POL-01 5.4)
-- ===========================================================================
create table if not exists public.kyc_profiles (
  user_id     uuid primary key references public.profiles(id) on delete restrict,
  level       smallint not null default 0,
  full_name   text null,
  cpf_hash    text null,
  cpf_last4   text null,
  birth_date  date null,
  status      text not null default 'pendente',
  risk_level  text not null default 'medio',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.kyc_profiles
  add column if not exists is_pep               boolean not null default false,
  add column if not exists pep_declarado        boolean not null default false,
  add column if not exists renda_mensal_cents   bigint null,
  add column if not exists renda_doc_tipo       text null,
  add column if not exists renda_analisada_em   date null,
  add column if not exists liveness_at          timestamptz null,
  add column if not exists liveness_fornecedor  text null,
  add column if not exists liveness_id          text null,
  add column if not exists liveness_resultado   text null,
  add column if not exists liveness_score       numeric null,
  add column if not exists bureau_birth_date    date null,
  add column if not exists minor_report         boolean not null default false,
  add column if not exists last_verified_at     timestamptz null,
  add column if not exists next_review_at       timestamptz null,
  add column if not exists preventive_hold      boolean not null default false,
  add column if not exists sanctions_freeze     boolean not null default false,
  add column if not exists freeze_lift_basis    text null,
  add column if not exists blocked_reason       text null,
  add column if not exists blocked_at           timestamptz null,
  add column if not exists lim_dep_dia_cents    bigint null,   -- redução individual (BO-POL-02 7.2 d); nunca aumenta
  add column if not exists lim_dep_mes_cents    bigint null,
  add column if not exists lim_saq_dia_cents    bigint null,
  add column if not exists lim_saq_mes_cents    bigint null;
alter table public.kyc_profiles alter column status set default 'pendente';
alter table public.kyc_profiles alter column risk_level set default 'medio';

alter table public.kyc_profiles drop constraint if exists kyc_profiles_level_check;
alter table public.kyc_profiles add constraint kyc_profiles_level_check check (level between 0 and 3);
alter table public.kyc_profiles drop constraint if exists kyc_profiles_cpf_hash_check;
alter table public.kyc_profiles add constraint kyc_profiles_cpf_hash_check check (cpf_hash is null or cpf_hash ~ '^[0-9a-f]{64}$');
alter table public.kyc_profiles drop constraint if exists kyc_profiles_cpf_last4_check;
alter table public.kyc_profiles add constraint kyc_profiles_cpf_last4_check check (cpf_last4 is null or cpf_last4 ~ '^[0-9]{4}$');
alter table public.kyc_profiles drop constraint if exists kyc_profiles_status_check;
alter table public.kyc_profiles add constraint kyc_profiles_status_check check (status in
  ('pendente', 'completo', 'em_divergencia', 'atualizacao_vencida', 'bloqueado', 'encerrado', 'recusado'));
alter table public.kyc_profiles drop constraint if exists kyc_profiles_risk_level_check;
alter table public.kyc_profiles add constraint kyc_profiles_risk_level_check check (risk_level in ('baixo', 'medio', 'alto'));
alter table public.kyc_profiles drop constraint if exists kyc_level_needs_identity;
alter table public.kyc_profiles add constraint kyc_level_needs_identity check (
  -- nível 1: identidade; nível 2: + prova de vida aprovada; nível 3: + renda/origem comprovada
      (level < 1 or (full_name is not null and cpf_hash is not null and cpf_last4 is not null and birth_date is not null))
  and (level < 2 or liveness_resultado = 'aprovado')
  and (level < 3 or (renda_mensal_cents is not null and renda_analisada_em is not null)));
alter table public.kyc_profiles drop constraint if exists kyc_freeze_is_blocked;
alter table public.kyc_profiles add constraint kyc_freeze_is_blocked check (not sanctions_freeze or status = 'bloqueado');
alter table public.kyc_profiles drop constraint if exists kyc_limits_nonneg;
alter table public.kyc_profiles add constraint kyc_limits_nonneg check (
  coalesce(lim_dep_dia_cents, 0) >= 0 and coalesce(lim_dep_mes_cents, 0) >= 0 and
  coalesce(lim_saq_dia_cents, 0) >= 0 and coalesce(lim_saq_mes_cents, 0) >= 0);
create unique index if not exists kyc_profiles_cpf_hash_uidx on public.kyc_profiles (cpf_hash) where cpf_hash is not null;

create or replace function public.kyc_guard()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- BO-POL-03 7.3: 'completo' exige os dados obrigatórios; BO-POL-01 8.1 f: menor de 18 nunca
  if new.status = 'completo' then
    if new.full_name is null or new.cpf_hash is null or new.birth_date is null then
      raise exception 'KYC_INCOMPLETE: status completo exige nome, CPF e nascimento' using errcode = 'P0001';
    end if;
    if new.birth_date > (current_date - interval '18 years')::date then
      raise exception 'KYC_UNDERAGE: menor de 18 anos não pode ter cadastro completo' using errcode = 'P0001';
    end if;
  end if;
  -- BO-POL-01 5.5: alto risco automático para PEP e para nível 3
  if new.is_pep or new.level = 3 then
    new.risk_level := 'alto';
  end if;
  -- BO-POL-02 10.1: próxima atualização pelo risco (alto 12, médio 24, baixo 36 meses)
  if new.last_verified_at is not null then
    new.next_review_at := new.last_verified_at + case new.risk_level when 'alto' then interval '12 months'
                                                   when 'medio' then interval '24 months' else interval '36 months' end;
  end if;
  -- BO-POL-01 7.2 d: indisponibilidade CSNU só sai com fundamento registrado (exclusão da lista / autoridade)
  if tg_op = 'UPDATE' and old.sanctions_freeze and not new.sanctions_freeze and coalesce(new.freeze_lift_basis, '') = '' then
    raise exception 'KYC_FREEZE_LOCKED: indisponibilidade CSNU só é levantada com fundamento (freeze_lift_basis)' using errcode = 'P0001';
  end if;
  if new.status = 'bloqueado' and (tg_op = 'INSERT' or old.status <> 'bloqueado') then
    new.blocked_at := now();
  end if;
  -- mudou o CPF: destinos de saque cadastrados com o CPF antigo deixam de valer
  if tg_op = 'UPDATE' and new.cpf_hash is distinct from old.cpf_hash then
    update public.payout_destinations set active = false, deactivated_reason = 'kyc_cpf_changed'
     where user_id = new.user_id and active;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 3. screening_results — cada consulta às listas (ONU, OFAC, PEP, CEIS, CNEP), com ou sem match
-- decision: clear | review (possível, só nome/parcial) | match (nome igual, sem identificador extra)
--           | confirmed (nome + identificador extra: nascimento ou CPF) | false_positive (após revisão humana)
-- ===========================================================================
create table if not exists public.screening_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid null references public.profiles(id) on delete restrict,
  cpf_hash      text null check (cpf_hash is null or cpf_hash ~ '^[0-9a-f]{64}$'),
  full_name     text not null,
  lists_checked jsonb not null,
  matches       jsonb not null default '[]'::jsonb,
  decision      text not null check (decision in ('clear', 'review', 'match', 'false_positive', 'confirmed')),
  reviewed_by   text null,
  reviewed_at   timestamptz null,
  note          text null,
  created_at    timestamptz not null default now()
);
create index if not exists screening_results_user_idx on public.screening_results (user_id, created_at);

-- ===========================================================================
-- 4. aml_alerts — saída do motor de regras (tools/compliance/monitor.py) e das triggers G01/G02
-- ===========================================================================
create table if not exists public.aml_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid null references public.profiles(id) on delete restrict,
  rule        text not null,
  severity    text not null check (severity in ('low', 'medium', 'high', 'critical')),
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  status      text not null default 'open'
              check (status in ('open', 'under_review', 'closed_no_action', 'closed_reported')),
  analyst     text null,
  note        text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  due_at      timestamptz not null,
  closed_at   timestamptz null
);
alter table public.aml_alerts
  add column if not exists conclusao        text null,
  add column if not exists related_users    uuid[] not null default '{}',
  add column if not exists hold_withdrawals boolean not null default false,
  add column if not exists hold_deposits    boolean not null default false,
  add column if not exists hold_play        boolean not null default false;
alter table public.aml_alerts drop constraint if exists aml_alerts_conclusao_check;
alter table public.aml_alerts add constraint aml_alerts_conclusao_check check (conclusao is null or conclusao in
  ('nao_suspeito', 'suspeito_comunicar', 'encerrar_relacionamento'));
alter table public.aml_alerts drop constraint if exists aml_closed_needs_analyst;
alter table public.aml_alerts add constraint aml_closed_needs_analyst check (
  status not in ('closed_no_action', 'closed_reported') or (analyst is not null and note is not null and conclusao is not null));
create index if not exists aml_alerts_status_idx on public.aml_alerts (status, due_at);
create index if not exists aml_alerts_user_idx on public.aml_alerts (user_id, status);

create or replace function public.aml_alert_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status in ('closed_no_action', 'closed_reported') and old.status not in ('closed_no_action', 'closed_reported') then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 5. payout_destinations — saque só para chave/conta do MESMO CPF do kyc_profile (BO-POL-01 8.1 c)
--    cpf_titular_hash = HMAC do CPF do titular devolvido pelo PSP/DICT na consulta da chave (Trio, v2).
--    payout_rejections guarda as tentativas recusadas (regra P06), porque o insert recusado é desfeito.
-- ===========================================================================
create table if not exists public.payout_destinations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete restrict,
  cpf_titular_hash   text not null check (cpf_titular_hash ~ '^[0-9a-f]{64}$'),
  chave              text not null check (char_length(chave) between 1 and 140),
  chave_tipo         text not null default 'evp' check (chave_tipo in ('cpf', 'email', 'phone', 'evp', 'conta')),
  active             boolean not null default true,
  deactivated_reason text null,
  created_at         timestamptz not null default now()
);
create unique index if not exists payout_destinations_user_chave_uidx on public.payout_destinations (user_id, chave);
create index if not exists payout_destinations_chave_idx on public.payout_destinations (chave);

create table if not exists public.payout_rejections (
  id               bigserial primary key,
  user_id          uuid not null references public.profiles(id) on delete restrict,
  cpf_titular_hash text null,
  chave            text null,
  reason           text not null,
  created_at       timestamptz not null default now()
);

create or replace function public.payout_destination_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.kyc_profiles%rowtype;
begin
  if tg_op = 'UPDATE' and not new.active then
    return new;                                   -- desativar é sempre permitido
  end if;
  select * into k from public.kyc_profiles where user_id = new.user_id;
  if not found then
    raise exception 'PAYOUT_NO_KYC: usuário sem kyc_profile não cadastra destino de saque' using errcode = 'P0001';
  end if;
  if k.status <> 'completo' or k.level < 2 then
    raise exception 'PAYOUT_KYC_NOT_ALLOWED: status % / nível % (saque exige completo e nível >= 2)', k.status, k.level
      using errcode = 'P0001';
  end if;
  if k.cpf_hash is distinct from new.cpf_titular_hash then
    raise exception 'PAYOUT_HOLDER_MISMATCH: titular da chave não é o CPF do KYC' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- caminho da aplicação: registra o destino ou, se recusado, grava a tentativa (P06) e devolve o erro sem abortar
create or replace function public.register_payout_destination(p_user uuid, p_cpf_titular_hash text, p_chave text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  begin
    insert into public.payout_destinations (user_id, cpf_titular_hash, chave, chave_tipo)
    values (p_user, p_cpf_titular_hash, p_chave, p_tipo) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  exception when sqlstate 'P0001' then
    insert into public.payout_rejections (user_id, cpf_titular_hash, chave, reason)
    values (p_user, p_cpf_titular_hash, p_chave, sqlerrm);
    return jsonb_build_object('ok', false, 'error', split_part(sqlerrm, ':', 1), 'message', sqlerrm);
  end;
end;
$$;

-- ===========================================================================
-- 6. ledger: append-only também contra o service_role, kinds de dinheiro real e limites por nível de KYC
-- ===========================================================================
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check
  check (kind in ('credit_test', 'buyin', 'cashout', 'rake', 'adjust', 'deposit', 'withdrawal'));

create or replace function public.ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'LEDGER_APPEND_ONLY: % em ledger é proibido; corrija com uma linha nova (kind adjust)', tg_op
    using errcode = 'P0001';
end;
$$;
drop trigger if exists ledger_no_update_delete on public.ledger;
create trigger ledger_no_update_delete before update or delete on public.ledger
  for each row execute function public.ledger_immutable();
drop trigger if exists ledger_no_truncate on public.ledger;
create trigger ledger_no_truncate before truncate on public.ledger
  for each statement execute function public.ledger_immutable();

-- limites do nível (BO-POL-02 7.1), em centavos: {dep_dia, dep_mes, saq_dia, saq_mes, saq_qtd_dia}
create or replace function public.kyc_level_limits(p_level int, p_renda bigint)
returns jsonb
language sql
immutable
as $$
  select case p_level
    when 1 then jsonb_build_object('dep_dia', 50000, 'dep_mes', 200000, 'saq_dia', 0, 'saq_mes', 0, 'saq_qtd_dia', 0)
    when 2 then jsonb_build_object('dep_dia', 200000, 'dep_mes', 1000000, 'saq_dia', 200000, 'saq_mes', 1000000, 'saq_qtd_dia', 3)
    when 3 then jsonb_build_object('dep_dia', 1000000, 'dep_mes', least(5000000, coalesce(p_renda, 0)),
                                   'saq_dia', 1000000, 'saq_mes', 5000000, 'saq_qtd_dia', 3)
    else jsonb_build_object('dep_dia', 0, 'dep_mes', 0, 'saq_dia', 0, 'saq_mes', 0, 'saq_qtd_dia', 0)
  end
$$;

-- recusa o movimento antes da liquidação (BO-POL-02 7.2 b; BO-POL-03 7.1). Sem crédito parcial.
create or replace function public.ledger_kyc_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k       public.kyc_profiles%rowtype;
  lim     jsonb;
  v_amt   bigint := abs(new.amount_cents);
  v_day0  timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_mon0  timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_day   bigint;
  v_mon   bigint;
  v_cnt   int;
  v_dest  uuid;
begin
  if new.user_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return new;
  end if;
  select * into k from public.kyc_profiles where user_id = new.user_id;

  -- conta bloqueada / indisponível: nem fichas entram em jogo (a volta da mesa, cashout, continua permitida)
  if found and new.kind in ('buyin', 'credit_test', 'deposit', 'withdrawal')
     and (k.sanctions_freeze or k.status in ('bloqueado', 'encerrado', 'recusado')) then
    raise exception 'ACCOUNT_BLOCKED: conta % (status %, indisponibilidade %)', new.user_id, k.status, k.sanctions_freeze
      using errcode = 'P0001';
  end if;
  if new.kind in ('buyin', 'credit_test') and exists (
       select 1 from public.aml_alerts a where a.status in ('open', 'under_review') and a.hold_play
          and (a.user_id = new.user_id or new.user_id = any (a.related_users))) then
    raise exception 'AML_HOLD_PLAY: alerta aberto suspende o jogo desta conta' using errcode = 'P0001';
  end if;
  if new.kind not in ('deposit', 'withdrawal') then
    return new;
  end if;

  if new.kind = 'deposit' and new.amount_cents <= 0 or new.kind = 'withdrawal' and new.amount_cents >= 0 then
    raise exception 'LEDGER_SIGN: deposit é positivo, withdrawal é negativo' using errcode = 'P0001';
  end if;
  if not found then
    raise exception 'KYC_REQUIRED: nível 0 / sem cadastro não deposita nem saca' using errcode = 'P0001';
  end if;
  if k.status <> 'completo' then
    raise exception 'KYC_STATUS: status % não permite movimentação', k.status using errcode = 'P0001';
  end if;
  if k.next_review_at is not null and k.next_review_at < now() then
    raise exception 'KYC_REVIEW_OVERDUE: atualização cadastral vencida' using errcode = 'P0001';
  end if;
  if k.preventive_hold then
    raise exception 'KYC_PREVENTIVE_HOLD: bloqueio preventivo (screening) até a análise' using errcode = 'P0001';
  end if;
  if k.is_pep and k.level < 3 then
    raise exception 'KYC_PEP: PEP só movimenta após diligência reforçada (nível 3)' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.aml_alerts a where a.status in ('open', 'under_review')
               and (a.user_id = new.user_id or new.user_id = any (a.related_users))
               and ((new.kind = 'deposit' and a.hold_deposits) or (new.kind = 'withdrawal' and a.hold_withdrawals))) then
    raise exception 'AML_HOLD: alerta aberto retém % desta conta até a análise', new.kind using errcode = 'P0001';
  end if;

  lim := public.kyc_level_limits(k.level, k.renda_mensal_cents);
  perform pg_advisory_xact_lock(hashtext('kyc_limits:' || new.user_id::text));
  select coalesce(sum(abs(amount_cents)) filter (where created_at >= v_day0), 0),
         coalesce(sum(abs(amount_cents)), 0),
         count(*) filter (where created_at >= v_day0)
    into v_day, v_mon, v_cnt
    from public.ledger where user_id = new.user_id and kind = new.kind and created_at >= v_mon0;

  if new.kind = 'deposit' then
    if v_day + v_amt > least((lim ->> 'dep_dia')::bigint, coalesce(k.lim_dep_dia_cents, (lim ->> 'dep_dia')::bigint))
       or v_mon + v_amt > least((lim ->> 'dep_mes')::bigint, coalesce(k.lim_dep_mes_cents, (lim ->> 'dep_mes')::bigint)) then
      raise exception 'KYC_LIMIT: depósito de % excede o limite do nível % (dia % / mês % já usados)', v_amt, k.level, v_day, v_mon
        using errcode = 'P0001';
    end if;
  else
    if v_cnt + 1 > (lim ->> 'saq_qtd_dia')::int
       or v_day + v_amt > least((lim ->> 'saq_dia')::bigint, coalesce(k.lim_saq_dia_cents, (lim ->> 'saq_dia')::bigint))
       or v_mon + v_amt > least((lim ->> 'saq_mes')::bigint, coalesce(k.lim_saq_mes_cents, (lim ->> 'saq_mes')::bigint)) then
      raise exception 'KYC_LIMIT: saque de % excede o limite do nível % (dia % / mês % / % saques hoje)', v_amt, k.level, v_day, v_mon, v_cnt
        using errcode = 'P0001';
    end if;
    -- saque só para destino ativo do próprio usuário (cuja titularidade = CPF do KYC, garantida no cadastro do destino)
    begin
      v_dest := (new.meta ->> 'payout_destination_id')::uuid;
    exception when others then
      v_dest := null;
    end;
    if v_dest is null or not exists (
         select 1 from public.payout_destinations d
          where d.id = v_dest and d.user_id = new.user_id and d.active and d.cpf_titular_hash = k.cpf_hash) then
      raise exception 'PAYOUT_DESTINATION_REQUIRED: saque exige meta.payout_destination_id ativo e de mesma titularidade'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ledger_kyc_limits on public.ledger;
create trigger ledger_kyc_limits before insert on public.ledger
  for each row execute function public.ledger_kyc_limits();

-- ===========================================================================
-- 7. G01 / G02: efeito automático do screening (BO-POL-01 7.2, 7.3, 7.4, 6.4.4)
-- ===========================================================================
create or replace function public.screening_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_un_conf   boolean;
  v_ofac_conf boolean;
  v_possible  boolean;
  v_pep       boolean;
  v_un_any    boolean;
  v_ofac_any  boolean;
  k           public.kyc_profiles%rowtype;
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.decision is not distinct from old.decision then
    return new;                                   -- só inserção ou mudança de decisão gera efeito
  end if;
  select
    coalesce(bool_or(m ->> 'source' = 'un'   and m ->> 'level' = 'confirmed'), false),
    coalesce(bool_or(m ->> 'source' = 'ofac' and m ->> 'level' = 'confirmed'), false),
    coalesce(bool_or(m ->> 'source' in ('un', 'ofac') and m ->> 'level' in ('match', 'review')), false),
    coalesce(bool_or(m ->> 'source' = 'pep' and m ->> 'level' in ('match', 'confirmed')), false),
    coalesce(bool_or(m ->> 'source' = 'un'   and m ->> 'level' in ('match', 'review', 'confirmed')), false),
    coalesce(bool_or(m ->> 'source' = 'ofac' and m ->> 'level' in ('match', 'review', 'confirmed')), false)
    into v_un_conf, v_ofac_conf, v_possible, v_pep, v_un_any, v_ofac_any
    from jsonb_array_elements(coalesce(new.matches, '[]'::jsonb)) m;
  if new.decision = 'confirmed' then              -- analista confirmou uma correspondência possível
    v_un_conf := v_un_conf or v_un_any;
    v_ofac_conf := v_ofac_conf or v_ofac_any;
  end if;
  if new.decision = 'false_positive' then
    v_un_conf := false; v_ofac_conf := false; v_possible := false; v_pep := false;
  end if;
  select * into k from public.kyc_profiles where user_id = new.user_id;

  if v_un_conf then
    -- G01: bloqueio imediato + indisponibilidade; sem aviso ao cliente
    if found then
      update public.kyc_profiles set status = 'bloqueado', sanctions_freeze = true,
             blocked_reason = 'G01: correspondência confirmada na lista ONU/CSNU (screening ' || new.id || ')'
       where user_id = new.user_id;
    else
      insert into public.kyc_profiles (user_id, status, sanctions_freeze, risk_level, blocked_reason)
      values (new.user_id, 'bloqueado', true, 'alto', 'G01: correspondência confirmada na lista ONU/CSNU (screening ' || new.id || ')');
    end if;
    insert into public.aml_alerts (user_id, rule, severity, data, dedupe_key, due_at, hold_withdrawals, hold_deposits, hold_play)
    values (new.user_id, 'G01', 'critical',
            jsonb_build_object('screening_id', new.id, 'efeito', 'bloqueio imediato + indisponibilidade (BO-POL-01 7.2)',
                               'matches', new.matches),
            'G01|' || new.user_id || '|' || new.id, public.aml_due_at('critical'), true, true, true)
    on conflict (dedupe_key) do nothing;
  elsif v_ofac_conf then
    -- OFAC SDN confirmada (BO-POL-01 7.4): recusa/encerramento e bloqueio da movimentação
    if found then
      update public.kyc_profiles set status = 'bloqueado',
             blocked_reason = 'OFAC SDN confirmada (BO-POL-01 7.4), screening ' || new.id where user_id = new.user_id;
    else
      insert into public.kyc_profiles (user_id, status, risk_level, blocked_reason)
      values (new.user_id, 'bloqueado', 'alto', 'OFAC SDN confirmada (BO-POL-01 7.4), screening ' || new.id);
    end if;
    insert into public.aml_alerts (user_id, rule, severity, data, dedupe_key, due_at, hold_withdrawals, hold_deposits, hold_play)
    values (new.user_id, 'G01-OFAC', 'critical', jsonb_build_object('screening_id', new.id, 'base', 'BO-POL-01 7.4'),
            'G01-OFAC|' || new.user_id || '|' || new.id, public.aml_due_at('critical'), true, true, true)
    on conflict (dedupe_key) do nothing;
  elsif v_possible or (v_pep and not coalesce(k.pep_declarado, false)) then
    -- G02: possível correspondência (7.3: análise em até 1 dia útil) ou PEP não declarado (6.4.4): bloqueio preventivo
    if found then
      update public.kyc_profiles set preventive_hold = true, is_pep = (is_pep or v_pep) where user_id = new.user_id;
    end if;
    insert into public.aml_alerts (user_id, rule, severity, data, dedupe_key, due_at, hold_withdrawals, hold_deposits)
    values (new.user_id, 'G02', 'high',
            jsonb_build_object('screening_id', new.id, 'possivel_sancao', v_possible, 'pep_nao_declarado', v_pep,
                               'efeito', 'bloqueio preventivo (BO-POL-01 7.3 / 6.4.4)'),
            'G02|' || new.user_id || '|' || new.id,
            case when v_possible then public.compliance_add_business_days(now(), 1) else public.aml_due_at('high') end,
            true, true)
    on conflict (dedupe_key) do nothing;
  elsif v_pep and found then
    update public.kyc_profiles set is_pep = true where user_id = new.user_id and not is_pep;
  end if;

  -- falso positivo documentado libera o bloqueio preventivo (nunca a indisponibilidade CSNU)
  if tg_op = 'UPDATE' and new.decision = 'false_positive' and old.decision <> 'false_positive' then
    if coalesce(new.reviewed_by, '') = '' or coalesce(new.note, '') = '' then
      raise exception 'SCREENING_REVIEW: falso positivo exige reviewed_by e note com a evidência' using errcode = 'P0001';
    end if;
    update public.kyc_profiles set preventive_hold = false where user_id = new.user_id and preventive_hold;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 8. triggers
-- ===========================================================================
drop trigger if exists kyc_guard on public.kyc_profiles;
create trigger kyc_guard before insert or update on public.kyc_profiles
  for each row execute function public.kyc_guard();
drop trigger if exists aml_alert_touch on public.aml_alerts;
create trigger aml_alert_touch before update on public.aml_alerts
  for each row execute function public.aml_alert_touch();
drop trigger if exists payout_destination_guard on public.payout_destinations;
create trigger payout_destination_guard before insert or update on public.payout_destinations
  for each row execute function public.payout_destination_guard();
drop trigger if exists screening_effects on public.screening_results;
create trigger screening_effects after insert or update on public.screening_results
  for each row execute function public.screening_effects();

drop trigger if exists audit_kyc_profiles on public.kyc_profiles;
create trigger audit_kyc_profiles after insert or update or delete on public.kyc_profiles
  for each row execute function public.audit_row('user_id');
drop trigger if exists audit_aml_alerts on public.aml_alerts;
create trigger audit_aml_alerts after insert or update or delete on public.aml_alerts
  for each row execute function public.audit_row('id');
drop trigger if exists audit_payout_destinations on public.payout_destinations;
create trigger audit_payout_destinations after insert or update or delete on public.payout_destinations
  for each row execute function public.audit_row('id');
drop trigger if exists audit_payout_rejections on public.payout_rejections;
create trigger audit_payout_rejections after insert on public.payout_rejections
  for each row execute function public.audit_row('id');
drop trigger if exists audit_screening_results on public.screening_results;
create trigger audit_screening_results after insert or update or delete on public.screening_results
  for each row execute function public.audit_row('id');

-- ===========================================================================
-- 9. RLS + grants. Supabase dá ALL por default privileges a anon/authenticated em tabela nova: revoga tudo.
--    Só o service_role lê/escreve; o usuário autenticado lê o PRÓPRIO kyc_profile (colunas sem hash/bloqueio).
-- ===========================================================================
alter table public.audit_log           enable row level security;
alter table public.kyc_profiles        enable row level security;
alter table public.screening_results   enable row level security;
alter table public.aml_alerts          enable row level security;
alter table public.payout_destinations enable row level security;
alter table public.payout_rejections   enable row level security;

revoke all on public.audit_log, public.kyc_profiles, public.screening_results, public.aml_alerts,
              public.payout_destinations, public.payout_rejections from public, anon, authenticated;
revoke all on sequence public.audit_log_id_seq, public.payout_rejections_id_seq from public, anon, authenticated;

revoke update, delete, truncate on public.audit_log, public.kyc_profiles, public.screening_results, public.aml_alerts,
       public.payout_destinations, public.payout_rejections from service_role;   -- guarda de 10 anos: nada se apaga
grant select, insert on public.audit_log to service_role;          -- sem update/delete nem para o service_role
grant usage on sequence public.audit_log_id_seq, public.payout_rejections_id_seq to service_role;
grant select, insert, update on public.kyc_profiles, public.screening_results, public.aml_alerts,
                                public.payout_destinations to service_role;
grant select, insert on public.payout_rejections to service_role;
revoke update, delete, truncate on public.ledger from service_role; -- e a trigger barra até o postgres
grant select, insert on public.ledger to service_role;

grant select (user_id, level, full_name, cpf_last4, birth_date, status, risk_level, created_at, updated_at)
  on public.kyc_profiles to authenticated;
drop policy if exists kyc_profiles_select_owner on public.kyc_profiles;
create policy kyc_profiles_select_owner on public.kyc_profiles
  for select to authenticated using (user_id = auth.uid());

revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.payout_destination_guard() from public, anon, authenticated;
revoke all on function public.register_payout_destination(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_payout_destination(uuid, text, text, text) to service_role;
revoke all on function public.ledger_kyc_limits() from public, anon, authenticated;
revoke all on function public.screening_effects() from public, anon, authenticated;
revoke all on function public.compliance_actor() from public, anon, authenticated;
