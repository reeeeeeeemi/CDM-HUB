-- ============================================================
--  HUB Events — anniversaires et lieux
--
--    · chacun peut donner sa date de naissance : le groupe est
--      prévenu le matin du jour J
--    · le carnet des lieux, chez les uns et les autres : adresse,
--      code, étage. Un event ou une proposition de sondage peut
--      s'y accrocher, et affiche alors ces infos à jour.
-- ============================================================

alter table public.profiles
  add column birthday date,
  add column notify_birthday boolean not null default true;


-- ------------------------------------------------------------
--  Les lieux
-- ------------------------------------------------------------
create table public.places (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  address    text,
  door_code  text,
  -- Étage, bâtiment, nom sur l'interphone : un seul champ, chacun l'écrit
  -- comme on le lui dirait au téléphone.
  access     text,
  created_at timestamptz not null default now()
);

create index places_owner_idx on public.places (owner_id);

alter table public.places enable row level security;

-- Le groupe est privé : tout membre voit tout, code compris.
create policy "lieux visibles par le groupe"
  on public.places for select
  using (public.is_member());

create policy "un membre ajoute ses lieux"
  on public.places for insert
  with check (public.is_member() and owner_id = auth.uid());

create policy "le propriétaire modifie son lieu"
  on public.places for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "le propriétaire supprime son lieu"
  on public.places for delete
  using (owner_id = auth.uid());

-- Un lieu supprimé laisse son nom à l'event, qui ne perd que les infos.
alter table public.events
  add column place_id uuid references public.places (id) on delete set null;
alter table public.place_options
  add column place_id uuid references public.places (id) on delete set null;


-- ============================================================
--  Les anniversaires du jour, pour la tâche du matin
--
--  Une ligne par (appareil, personne fêtée). On ne prévient pas
--  la personne de son propre anniversaire. Le jour est celui de
--  Paris : la tâche tourne à 6 h 30 UTC, et un 29 février se
--  fête le 28 les années qui n'en ont pas.
-- ============================================================
create function public.birthdays_pending(secret text)
returns table (endpoint text, p256dh text, auth text, pseudo text, age integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  leap  boolean := extract(day from (date_trunc('year', today) + interval '2 months' - interval '1 day')) = 29;
begin
  if secret is null
     or secret <> (select value from public.app_config where key = 'digest_secret')
  then
    return;
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth, b.pseudo,
           (extract(year from today) - extract(year from b.birthday))::int
    from public.profiles b
    join public.members bm on bm.user_id = b.id
    join public.members m  on m.user_id <> b.id
    join public.profiles p on p.id = m.user_id
    join public.push_subscriptions s on s.user_id = m.user_id
    where b.birthday is not null
      and p.notify_birthday
      and (
        (extract(month from b.birthday) = extract(month from today)
         and extract(day from b.birthday) = extract(day from today))
        or (not leap
            and extract(month from b.birthday) = 2 and extract(day from b.birthday) = 29
            and extract(month from today) = 2 and extract(day from today) = 28)
      );
end $$;

revoke execute on function public.birthdays_pending(text) from public;
-- Comme digest_pending : c'est le secret qui garde la porte.
grant  execute on function public.birthdays_pending(text) to anon, authenticated;
