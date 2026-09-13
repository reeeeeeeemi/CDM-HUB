-- ============================================================
--  HUB Events CDM — choisir ses notifications
--
--  Les trois règles de 0007 deviennent trois interrupteurs, un
--  par personne. Tout est à true : ceux qui ont déjà activé les
--  notifications gardent exactement ce qu'ils avaient.
-- ============================================================

alter table public.profiles
  add column notify_big  boolean not null default true,
  add column notify_city boolean not null default true,
  add column notify_mine boolean not null default true;


-- ------------------------------------------------------------
--  Règles 1 et 2, filtrées par les préférences de chacun
--
--  Un big event relève de notify_big, un plan du quotidien de
--  notify_city. Un big event qui se trouve avoir une ville reste
--  un big event : il ne bascule pas sur l'autre interrupteur.
-- ------------------------------------------------------------
create or replace function public.push_targets_for_event(event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  if not exists (select 1 from public.members where user_id = me) then return; end if;

  select * into ev from public.events where id = event_id;
  if not found then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.members  m on m.user_id = s.user_id
    join public.profiles p on p.id      = s.user_id
    where s.user_id <> me
      and (
        (ev.scale = 'big' and p.notify_big)
        or (ev.scale <> 'big' and ev.city is not null
            and p.city = ev.city and p.notify_city)
      );
end $$;


-- ------------------------------------------------------------
--  Règle 3, filtrée de même
-- ------------------------------------------------------------
create or replace function public.push_targets_for_author(event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  if not exists (select 1 from public.members where user_id = me) then return; end if;

  select * into ev from public.events where id = event_id;
  if not found then return; end if;
  if ev.created_by is null or ev.created_by = me then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.user_id = ev.created_by
      and p.notify_mine;
end $$;
