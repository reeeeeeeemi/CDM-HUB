-- ============================================================
--  HUB Events CDM — notifications push
--
--  Trois règles, décidées ici plutôt que côté serveur : elles
--  ont besoin de croiser events, profiles et members, et cette
--  logique vit près des politiques RLS qui la gardent honnête.
--
--    1. un big event  → tout le groupe
--    2. un event du quotidien → ceux dont le profil dit qu'ils
--       vivent dans cette ville
--    3. une réaction  → l'auteur de l'event, et lui seul
-- ============================================================

create table public.push_subscriptions (
  -- L'endpoint est l'adresse unique que le navigateur donne au service de
  -- push ; il fait donc une clé primaire naturelle. Un même compte en a un
  -- par appareil, d'où l'absence de contrainte d'unicité sur user_id.
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Chacun ne voit et ne gère que ses propres appareils. Les envois passent
-- par les fonctions ci-dessous, qui contournent cette politique.
create policy "ses propres abonnements"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
--  Qui prévenir pour un event qui vient d'être publié
-- ------------------------------------------------------------
create function public.push_targets_for_event(event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  -- security definer : sans ces deux gardes, n'importe qui lirait les
  -- abonnements de tout le monde.
  if me is null then return; end if;
  if not exists (select 1 from public.members where user_id = me) then return; end if;

  select * into ev from public.events where id = event_id;
  if not found then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.members  m on m.user_id = s.user_id
    join public.profiles p on p.id      = s.user_id
    where s.user_id <> me                       -- jamais l'auteur du plan
      and (
        ev.scale = 'big'                        -- règle 1
        or (ev.city is not null and p.city = ev.city)  -- règle 2
      );
end $$;


-- ------------------------------------------------------------
--  Qui prévenir quand on réagit sur l'event de quelqu'un
-- ------------------------------------------------------------
create function public.push_targets_for_author(event_id uuid)
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
  -- Réagir sur son propre plan ne se notifie pas.
  if ev.created_by is null or ev.created_by = me then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    where s.user_id = ev.created_by;          -- règle 3
end $$;


-- ------------------------------------------------------------
--  Oublier un appareil que le service de push a déclaré mort
--
--  L'endpoint appartient à un autre compte que l'appelant : la
--  politique ci-dessus l'empêcherait de le supprimer.
-- ------------------------------------------------------------
create function public.prune_push_subscription(dead_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.push_subscriptions where endpoint = dead_endpoint;
end $$;


revoke execute on function public.push_targets_for_event(uuid)   from public;
revoke execute on function public.push_targets_for_author(uuid)  from public;
revoke execute on function public.prune_push_subscription(text)  from public;
grant  execute on function public.push_targets_for_event(uuid)   to authenticated;
grant  execute on function public.push_targets_for_author(uuid)  to authenticated;
grant  execute on function public.prune_push_subscription(text)  to authenticated;
