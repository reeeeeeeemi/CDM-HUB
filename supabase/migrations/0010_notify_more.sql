-- ============================================================
--  HUB Events — suite des notifications
--
--    · plusieurs villes au lieu d'une
--    · les events où tu es chaud : sondage figé, event annulé
--    · un récapitulatif quotidien de qui s'est ajouté
--
--  À noter : il n'existe pas d'écran d'édition d'event. Une
--  date ou un lieu ne changent qu'au moment où le créateur fige
--  un sondage — « la date change » et « le sondage se clôt »
--  sont donc le même instant, et une seule règle les couvre.
-- ============================================================

alter table public.profiles
  -- Les villes dont on veut être prévenu. `city` reste à côté : elle dit où
  -- l'on vit, et sert à ouvrir l'onglet quotidien sur la bonne ville.
  add column notify_cities text[] not null default '{}',
  -- Sondage figé ou event annulé, sur un plan où l'on s'est dit chaud.
  add column notify_joined  boolean not null default true,
  -- Le récapitulatif du matin.
  add column notify_digest  boolean not null default true;

-- Personne ne perd son réglage : la ville unique devient la première de la
-- liste. Le faire ici évite que chacun ait à le refaire à la main.
update public.profiles
set notify_cities = array[city]
where city is not null and city <> '';


-- ------------------------------------------------------------
--  Règles 1 et 2, avec plusieurs villes
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
            and p.notify_city and ev.city = any (p.notify_cities))
      );
end $$;


-- ------------------------------------------------------------
--  Règle 4 : les gens chauds sur un plan qui bouge
--
--  Sert au sondage figé comme à l'annulation. L'auteur de
--  l'action est toujours écarté : il sait ce qu'il vient de faire.
-- ------------------------------------------------------------
create function public.push_targets_for_attendees(event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  if not exists (select 1 from public.members where user_id = me) then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.event_rsvps r
    join public.profiles p on p.id = r.user_id
    join public.push_subscriptions s on s.user_id = r.user_id
    where r.event_id = push_targets_for_attendees.event_id
      and r.status = 'in'
      and r.user_id <> me
      and p.notify_joined;
end $$;


-- ============================================================
--  Le récapitulatif du matin
--
--  Envoyé par une tâche planifiée, donc sans personne de
--  connecté : auth.uid() est nul et les politiques ne donnent
--  rien. Un secret partagé tient lieu d'authentification.
-- ============================================================

create table public.app_config (
  key   text primary key,
  value text not null
);

-- Volontairement aucune politique : ni anon ni authenticated n'accèdent à
-- cette table. Seules les fonctions security definer, qui s'exécutent au nom
-- du propriétaire, peuvent la lire.
alter table public.app_config enable row level security;

insert into public.app_config (key, value)
values ('digest_secret', encode(gen_random_bytes(24), 'hex'));


/*
 * Une ligne par (appareil, event) où quelqu'un d'autre s'est dit chaud
 * depuis 24 h, sur un plan où le destinataire s'est lui-même dit chaud.
 * Le regroupement en une notification par personne se fait côté serveur.
 */
create function public.digest_pending(secret text)
returns table (endpoint text, p256dh text, auth text, event_id uuid, title text, joined integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if secret is null
     or secret <> (select value from public.app_config where key = 'digest_secret')
  then
    return;
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth, e.id, e.title, cnt.n
    from public.event_rsvps mine
    join public.events e            on e.id = mine.event_id
    join public.profiles p          on p.id = mine.user_id
    join public.push_subscriptions s on s.user_id = mine.user_id
    join lateral (
      select count(*)::int as n
      from public.event_rsvps r
      where r.event_id = e.id
        and r.status = 'in'
        and r.user_id <> mine.user_id      -- ses propres réponses ne comptent pas
        and r.updated_at > now() - interval '24 hours'
    ) cnt on cnt.n > 0
    where mine.status = 'in'
      and p.notify_digest
      -- Un plan déjà passé n'intéresse plus personne.
      and (e.starts_on is null or e.starts_on >= current_date);
end $$;


revoke execute on function public.push_targets_for_attendees(uuid) from public;
revoke execute on function public.digest_pending(text)             from public;
grant  execute on function public.push_targets_for_attendees(uuid) to authenticated;
-- digest_pending n'est appelable que par le serveur, avec le secret : la
-- fonction reste ouverte aux deux rôles, c'est le secret qui garde la porte.
grant  execute on function public.digest_pending(text) to anon, authenticated;
