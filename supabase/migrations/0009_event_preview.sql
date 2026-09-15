-- ============================================================
--  HUB Events — aperçu public d'un event
--
--  Partager le lien d'un plan dans WhatsApp suppose que
--  WhatsApp puisse lire la page : il la charge depuis ses
--  propres serveurs, sans compte et sans cookie. Les politiques
--  RLS lui renvoient donc zéro ligne, et l'aperçu reste vide.
--
--  Cette fonction est l'unique brèche, volontairement étroite :
--  le titre et les dates, rien d'autre. Ni ville, ni lieu, ni
--  description, ni qui vient. Un lien transféré hors du groupe
--  ne révèle que ce qu'on accepte de voir passer dans une
--  conversation.
-- ============================================================

create function public.event_preview(event_id uuid)
returns table (title text, starts_on date, ends_on date)
language sql
security definer
set search_path = ''
stable
as $$
  select e.title, e.starts_on, e.ends_on
  from public.events e
  where e.id = event_id;
$$;

-- anon compris : c'est tout l'objet de la fonction.
revoke execute on function public.event_preview(uuid) from public;
grant  execute on function public.event_preview(uuid) to anon, authenticated;
