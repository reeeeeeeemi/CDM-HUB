-- ============================================================
--  HUB Events — la relance
--
--  Le créateur d'un event peut relancer ceux qui n'ont pas
--  répondu, ou seulement « peut-être ». Une fois par 24 h au
--  plus : c'est la base qui tient le compte, pour qu'un
--  second téléphone ne suffise pas à contourner la limite.
-- ============================================================

alter table public.events
  -- Dernière relance. Nulle tant que personne n'a relancé.
  add column nudged_at timestamptz;

alter table public.profiles
  -- Les relances reçues des créateurs d'events.
  add column notify_nudge boolean not null default true;


/*
 * Relance un event et renvoie les appareils à prévenir.
 *
 * Tout se tranche ici, en une transaction : le droit (créateur, event à
 * venir), le délai, la date de relance, et les destinataires. L'appli ne
 * fait qu'envoyer ce qui revient.
 */
create function public.nudge_event(event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Session expirée.'; end if;

  select * into ev from public.events where id = nudge_event.event_id for update;
  if not found or ev.created_by <> me then
    raise exception 'Seul le créateur peut relancer cet event.';
  end if;
  if coalesce(ev.ends_on, ev.starts_on) < current_date then
    raise exception 'Cet event est passé.';
  end if;
  if ev.nudged_at > now() - interval '24 hours' then
    raise exception 'Une relance par jour au plus.';
  end if;

  update public.events set nudged_at = now() where id = ev.id;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.members m
    join public.profiles p           on p.id = m.user_id
    join public.push_subscriptions s on s.user_id = m.user_id
    left join public.event_rsvps r   on r.event_id = ev.id and r.user_id = m.user_id
    where m.user_id <> me
      and (r.status is null or r.status = 'maybe')
      and p.notify_nudge;
end $$;

revoke execute on function public.nudge_event(uuid) from public;
grant  execute on function public.nudge_event(uuid) to authenticated;
