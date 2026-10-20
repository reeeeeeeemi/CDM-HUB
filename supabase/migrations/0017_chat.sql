-- ============================================================
--  HUB Events — le chat d'un event
--
--  Les commentaires deviennent un chat : les mêmes messages, et
--  en plus
--    · répondre à un message précis
--    · réagir d'un emoji
--    · savoir ce qu'on n'a pas lu, sur tous ses appareils
--    · être prévenu, une fois par event tant qu'on n'a pas relu
--    · le temps réel, par Supabase Realtime
--
--  Tout reste dans le groupe de l'event : mêmes règles que les
--  commentaires.
-- ============================================================

begin;


-- ------------------------------------------------------------
--  1. Répondre à un message
--
--  Un message supprimé laisse sa réponse en place, sans citation.
-- ------------------------------------------------------------

alter table public.event_comments
  add column reply_to uuid references public.event_comments (id) on delete set null;


-- ------------------------------------------------------------
--  2. Les réactions
--
--  event_id est redondant avec le message, mais c'est sur lui que
--  le temps réel filtre : sans lui, chaque réaction de chaque
--  groupe arriverait chez tout le monde.
-- ------------------------------------------------------------

create table public.comment_reactions (
  comment_id uuid not null references public.event_comments (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (emoji in ('👍', '😂', '❤️', '🔥', '😮')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create index comment_reactions_event_idx on public.comment_reactions (event_id);

alter table public.comment_reactions enable row level security;


-- ------------------------------------------------------------
--  3. Ce que chacun a lu, et quand il a été prévenu
--
--  read_at nul : jamais ouvert. notified_at : la dernière
--  notification reçue pour ce chat. On n'en renvoie pas tant
--  qu'il n'a pas relu depuis.
--
--  On n'y écrit que par mark_chat_read et chat_targets : la
--  date de notification n'est pas à la main de chacun.
-- ------------------------------------------------------------

create table public.chat_reads (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  read_at     timestamptz,
  notified_at timestamptz,
  primary key (event_id, user_id)
);

create index chat_reads_user_idx on public.chat_reads (user_id);

alter table public.chat_reads enable row level security;

-- Les non-lus partent d'aujourd'hui : les vieux commentaires ne doivent pas
-- s'allumer chez tout le monde le jour où le chat arrive.
insert into public.app_config (key, value) values ('chat_since', now()::text)
on conflict (key) do nothing;

alter table public.profiles add column notify_chat boolean not null default true;


-- ------------------------------------------------------------
--  4. RLS
-- ------------------------------------------------------------

create function public.comment_event(c uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select event_id from public.event_comments where id = c;
$$;

create policy "réactions visibles du groupe"
  on public.comment_reactions for select
  using (public.is_member_of(public.event_group(event_id)));

-- La réaction doit viser un message de cet event : sans ce contrôle,
-- event_id pourrait mentir, et la réaction fuir vers un autre groupe.
create policy "chacun réagit pour soi"
  on public.comment_reactions for insert
  with check (
    user_id = auth.uid()
    and public.comment_event(comment_id) = event_id
    and public.is_member_of(public.event_group(event_id))
  );

create policy "chacun retire sa réaction"
  on public.comment_reactions for delete using (user_id = auth.uid());

create policy "chacun voit ce qu'il a lu"
  on public.chat_reads for select using (user_id = auth.uid());

-- Une réponse ne cite qu'un message du même event.
alter table public.event_comments
  add constraint event_comments_reply_check check (reply_to is null or reply_to <> id);

create function public.reply_same_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reply_to is not null
     and (select event_id from public.event_comments where id = new.reply_to) is distinct from new.event_id then
    raise exception 'On ne répond qu''à un message du même event.';
  end if;
  return new;
end $$;

create trigger event_comments_reply
  before insert on public.event_comments
  for each row execute function public.reply_same_event();


-- ------------------------------------------------------------
--  5. Lire, compter, prévenir
-- ------------------------------------------------------------

/* Ouvrir le chat, c'est l'avoir lu. */
create function public.mark_chat_read(event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_member_of(public.event_group(mark_chat_read.event_id)) then return; end if;
  insert into public.chat_reads (event_id, user_id, read_at)
  values (mark_chat_read.event_id, me, now())
  -- Par le nom de la contrainte : event_id est aussi le nom du paramètre.
  on conflict on constraint chat_reads_pkey do update set read_at = now();
end $$;


/*
 * Les messages non lus, event par event, dans un groupe : ceux des
 * autres, arrivés depuis la dernière lecture — et jamais avant
 * l'arrivée du chat.
 */
create function public.chat_unread(g uuid)
returns table (event_id uuid, unread integer)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  me    uuid := auth.uid();
  since timestamptz := (select value from public.app_config where key = 'chat_since')::timestamptz;
begin
  if me is null or not public.is_member_of(g) then return; end if;
  return query
    select c.event_id, count(*)::int
    from public.event_comments c
    join public.events e on e.id = c.event_id
    left join public.chat_reads r on r.event_id = c.event_id and r.user_id = me
    where e.group_id = g
      and c.author_id <> me
      and c.created_at > greatest(coalesce(r.read_at, since), coalesce(since, '-infinity'::timestamptz))
    group by c.event_id;
end $$;


/*
 * Qui prévenir d'un nouveau message : ceux qui viennent ou hésitent,
 * et le créateur de l'event — jamais l'auteur, ni qui a coupé le
 * groupe ou les messages du chat.
 *
 * Une notification par event tant qu'on n'a pas relu : quelqu'un déjà
 * prévenu, et qui n'a pas rouvert le chat depuis, ne l'est pas deux
 * fois. La fonction note qui elle prévient.
 */
create function public.chat_targets(event_id uuid)
returns table (endpoint text, p256dh text, auth text, prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  g       uuid := public.event_group(chat_targets.event_id);
  creator uuid := public.event_creator(chat_targets.event_id);
  targets uuid[];
begin
  if me is null or g is null or not public.is_member_of(g) then return; end if;

  select array_agg(m.user_id) into targets
  from public.members m
  join public.profiles p on p.id = m.user_id
  left join public.event_rsvps r on r.event_id = chat_targets.event_id and r.user_id = m.user_id
  left join public.chat_reads cr on cr.event_id = chat_targets.event_id and cr.user_id = m.user_id
  where m.group_id = g
    and m.user_id <> me
    and not m.muted
    and p.notify_chat
    and (r.status in ('in', 'maybe') or m.user_id = creator)
    and (cr.notified_at is null or cr.read_at >= cr.notified_at);

  if targets is null then return; end if;

  insert into public.chat_reads (event_id, user_id, notified_at)
  select chat_targets.event_id, u, now() from unnest(targets) as u
  on conflict on constraint chat_reads_pkey do update set notified_at = now();

  return query
    select s.endpoint, s.p256dh, s.auth, public.group_prefix(g, s.user_id)
    from public.push_subscriptions s
    where s.user_id = any (targets);
end $$;


revoke execute on function public.mark_chat_read(uuid) from public;
revoke execute on function public.chat_unread(uuid)    from public;
revoke execute on function public.chat_targets(uuid)   from public;
grant  execute on function public.mark_chat_read(uuid) to authenticated;
grant  execute on function public.chat_unread(uuid)    to authenticated;
grant  execute on function public.chat_targets(uuid)   to authenticated;


-- ------------------------------------------------------------
--  6. Le temps réel
--
--  Supabase Realtime ne diffuse que les tables de sa publication,
--  et seulement à qui les politiques ci-dessus laissent les lire.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'event_comments') then
      alter publication supabase_realtime add table public.event_comments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comment_reactions') then
      alter publication supabase_realtime add table public.comment_reactions;
    end if;
  end if;
end $$;

commit;
