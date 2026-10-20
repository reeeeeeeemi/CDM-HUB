-- ============================================================
--  Étanchéité entre groupes
--
--  Crée deux groupes et cinq comptes, joue chaque rôle tour à
--  tour, et vérifie qu'aucun groupe ne voit ni ne touche ce qui
--  appartient à l'autre. S'arrête à la première fuite, avec un
--  message qui la nomme. Sinon, il finit sur une seule ligne :
--  « Étanchéité : tout est OK ».
--
--  Tout se passe dans une transaction annulée à la fin : on
--  peut le lancer sur la pré-prod comme sur la prod, il ne
--  laisse rien derrière lui. SQL Editor, ou :
--      psql "$DATABASE_URL" -f supabase/tests/isolation.sql
--
--  Les comptes :
--    a1  admin du groupe A      a2  membre de A
--    b1  admin du groupe B      b2  membre de B, puis aussi de A
--    nn  inscrit, d'aucun groupe
-- ============================================================

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'a1@test.local', '{"pseudo":"A-un"}'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'a2@test.local', '{"pseudo":"A-deux"}'),
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'b1@test.local', '{"pseudo":"B-un"}'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'b2@test.local', '{"pseudo":"B-deux"}'),
  ('aaaaaaaa-0000-0000-0000-0000000000ff', 'nn@test.local', '{"pseudo":"Personne"}');

-- Le décor, posé directement : ce qu'on teste, c'est ce que chacun voit
-- ensuite, pas la façon dont il a été posé.
insert into public.groups (id, name, categories, created_by, cities) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Groupe A', '{soiree,sport,resto}', 'aaaaaaaa-0000-0000-0000-0000000000a1', '[{"name":"Paris","emoji":"🗼"}]'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Groupe B', '{voyage,ski,poker}',   'aaaaaaaa-0000-0000-0000-0000000000b1', '[]');

insert into public.members (group_id, user_id, pseudo, role, added_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'A-un',   'admin',  now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'A-deux', 'member', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'B-un',   'admin',  now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'B-deux', 'member', now() - interval '2 days');

insert into public.events (id, group_id, title, category, scale, starts_on, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Event de A', 'soiree', 'big', current_date + 10, 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Event de B', 'voyage', 'big', current_date + 10, 'aaaaaaaa-0000-0000-0000-0000000000b1');

insert into public.event_rsvps (event_id, user_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'in'),
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'in'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'in');

insert into public.event_comments (id, event_id, author_id, body) values
  ('aaaaaaaa-0000-0000-0000-00000000cc01', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'secret de A');

-- Un appareil pour A-un : sans lui, une notification de chat ne se voit pas.
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('test://a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'x', 'x');

insert into public.date_options (id, event_id, on_date, added_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000e1', current_date + 20, 'aaaaaaaa-0000-0000-0000-0000000000a1');

insert into public.places (id, group_id, owner_id, name, door_code, is_home) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Bar de A',  null,   false),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Chez A-un', '1234', true),
  ('aaaaaaaa-0000-0000-0000-0000000000f3', 'aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'Chez B-deux', '9999', true);

insert into public.invites (id, group_id, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1');


-- ------------------------------------------------------------
--  B-un, admin de B, ne voit rien de A
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.groups) <> 1 then raise exception 'FUITE : B-un voit % groupes', (select count(*) from public.groups); end if;
  if exists (select 1 from public.events where title = 'Event de A') then raise exception 'FUITE : B-un voit l''event de A'; end if;
  if (select count(*) from public.events) <> 1 then raise exception 'B-un ne voit pas son propre event'; end if;
  if exists (select 1 from public.event_rsvps where event_id = 'aaaaaaaa-0000-0000-0000-0000000000e1') then raise exception 'FUITE : réponses de A'; end if;
  if exists (select 1 from public.event_comments) then raise exception 'FUITE : commentaire de A'; end if;
  if exists (select 1 from public.date_options) then raise exception 'FUITE : sondage de A'; end if;
  if exists (select 1 from public.members where group_id = 'aaaaaaaa-0000-0000-0000-00000000000a') then raise exception 'FUITE : membres de A'; end if;
  if exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000a1') then raise exception 'FUITE : fiche de A-un'; end if;
  if exists (select 1 from public.places where group_id = 'aaaaaaaa-0000-0000-0000-00000000000a') then raise exception 'FUITE : lieux de A (dont le code de porte)'; end if;
  if exists (select 1 from public.invites) then raise exception 'FUITE : invitation de A'; end if;
  if exists (select 1 from public.group_places('aaaaaaaa-0000-0000-0000-00000000000a')) then raise exception 'FUITE : group_places(A)'; end if;
  if exists (select 1 from public.push_targets_for_event('aaaaaaaa-0000-0000-0000-0000000000e1')) then raise exception 'FUITE : abonnés de A'; end if;
  if exists (select 1 from public.push_targets_for_attendees('aaaaaaaa-0000-0000-0000-0000000000e1')) then raise exception 'FUITE : chauds de A'; end if;
end $$;

-- Écrire chez A, par toutes les portes.
do $$
declare n int;
begin
  begin
    insert into public.events (group_id, title, created_by) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'intrus', 'aaaaaaaa-0000-0000-0000-0000000000b1');
    raise exception 'FUITE : B-un crée un event dans A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.event_rsvps (event_id, user_id, status) values ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'in');
    raise exception 'FUITE : B-un répond à un event de A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.event_comments (event_id, author_id, body) values ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'intrus');
    raise exception 'FUITE : B-un commente chez A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.date_votes (option_id, user_id) values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000b1');
    raise exception 'FUITE : B-un vote dans un sondage de A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.invites (group_id, created_by) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1');
    raise exception 'FUITE : B-un invite dans A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.places (group_id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'intrus');
    raise exception 'FUITE : B-un ajoute un lieu à A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.members (group_id, user_id, pseudo) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'intrus');
    raise exception 'FUITE : B-un s''ajoute à A';
  exception when insufficient_privilege then null;
  end;

  update public.events set title = 'piraté' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FUITE : B-un modifie l''event de A'; end if;
  delete from public.events where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FUITE : B-un supprime l''event de A'; end if;
  update public.groups set name = 'piraté' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FUITE : B-un renomme A'; end if;
  delete from public.groups where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FUITE : B-un supprime A'; end if;

  -- Déplacer son propre event chez A.
  begin
    update public.events set group_id = 'aaaaaaaa-0000-0000-0000-00000000000a' where id = 'aaaaaaaa-0000-0000-0000-0000000000e2';
    raise exception 'FUITE : B-un déplace son event dans A';
  exception when others then
    if sqlerrm like 'FUITE%' then raise; end if;
  end;

  -- Les fonctions d'admin de A.
  begin
    perform public.remove_member('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a2');
    raise exception 'FUITE : B-un retire un membre de A';
  exception when others then
    if sqlerrm like 'FUITE%' then raise; end if;
  end;
  begin
    perform public.set_member_role('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'admin');
    raise exception 'FUITE : B-un se nomme admin de A';
  exception when others then
    if sqlerrm like 'FUITE%' then raise; end if;
  end;
  begin
    perform public.nudge_event('aaaaaaaa-0000-0000-0000-0000000000e1');
    raise exception 'FUITE : B-un relance un event de A';
  exception when others then
    if sqlerrm like 'FUITE%' then raise; end if;
  end;
end $$;

-- Ni rôle ni groupe ne se changent à la main.
do $$
begin
  begin
    update public.members set role = 'admin' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000b1';
    raise exception 'FUITE : un membre change son propre rôle';
  exception when insufficient_privilege then null;
  end;
end $$;

-- L'aperçu d'un event de A : titre, dates et nom du groupe, rien d'autre.
do $$
begin
  if (select group_name from public.event_preview('aaaaaaaa-0000-0000-0000-0000000000e1')) <> 'Groupe A' then
    raise exception 'l''aperçu ne donne pas le nom du groupe';
  end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  Le chat : réactions, lectures, notifications
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

do $$
begin
  begin
    insert into public.comment_reactions (comment_id, event_id, user_id, emoji)
    values ('aaaaaaaa-0000-0000-0000-00000000cc01', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000b1', '👍');
    raise exception 'FUITE : B-un réagit à un message de A';
  exception when insufficient_privilege then null;
  end;
  -- En mentant sur l'event : la réaction viserait A depuis un event de B.
  begin
    insert into public.comment_reactions (comment_id, event_id, user_id, emoji)
    values ('aaaaaaaa-0000-0000-0000-00000000cc01', 'aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000b1', '👍');
    raise exception 'FUITE : B-un réagit à A en se faisant passer pour son event';
  exception when insufficient_privilege then null;
  end;
  -- Répondre depuis B à un message de A.
  begin
    insert into public.event_comments (event_id, author_id, body, reply_to)
    values ('aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'je cite A', 'aaaaaaaa-0000-0000-0000-00000000cc01');
    raise exception 'FUITE : B-un cite un message de A';
  exception when others then
    if sqlerrm like 'FUITE%' then raise; end if;
  end;
  if exists (select 1 from public.chat_unread('aaaaaaaa-0000-0000-0000-00000000000a')) then raise exception 'FUITE : non-lus de A'; end if;
  if exists (select 1 from public.chat_targets('aaaaaaaa-0000-0000-0000-0000000000e1')) then raise exception 'FUITE : destinataires du chat de A'; end if;
  perform public.mark_chat_read('aaaaaaaa-0000-0000-0000-0000000000e1');
  if exists (select 1 from public.chat_reads) then raise exception 'FUITE : B-un marque lu un chat de A'; end if;
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

do $$
declare n int;
begin
  insert into public.comment_reactions (comment_id, event_id, user_id, emoji)
  values ('aaaaaaaa-0000-0000-0000-00000000cc01', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000a2', '🔥');
  if (select count(*) from public.comment_reactions) <> 1 then raise exception 'A-deux ne voit pas sa réaction'; end if;
  if (select unread from public.chat_unread('aaaaaaaa-0000-0000-0000-00000000000a')) <> 1 then raise exception 'le message de A-un n''est pas compté non lu'; end if;
  perform public.mark_chat_read('aaaaaaaa-0000-0000-0000-0000000000e1');
  if exists (select 1 from public.chat_unread('aaaaaaaa-0000-0000-0000-00000000000a')) then raise exception 'lu, le message compte encore'; end if;
  -- A-un, chaud et créateur, est prévenu une fois…
  select count(*) into n from public.chat_targets('aaaaaaaa-0000-0000-0000-0000000000e1');
  if n <> 1 then raise exception 'A-un aurait dû être prévenu (% appareil)', n; end if;
  -- …et pas une deuxième tant qu'il n'a pas relu.
  select count(*) into n from public.chat_targets('aaaaaaaa-0000-0000-0000-0000000000e1');
  if n <> 0 then raise exception 'A-un prévenu deux fois sans avoir relu'; end if;
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin perform public.mark_chat_read('aaaaaaaa-0000-0000-0000-0000000000e1'); end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.chat_targets('aaaaaaaa-0000-0000-0000-0000000000e1')) <> 1 then
    raise exception 'A-un a relu : il doit être prévenu de nouveau';
  end if;
end $$;
reset role;


-- ------------------------------------------------------------
--  Inscrit sans groupe : rien, sauf sa propre fiche
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.groups) then raise exception 'FUITE : un inscrit sans groupe voit un groupe'; end if;
  if exists (select 1 from public.events) then raise exception 'FUITE : un inscrit sans groupe voit un event'; end if;
  if exists (select 1 from public.places) then raise exception 'FUITE : un inscrit sans groupe voit un lieu'; end if;
  if exists (select 1 from public.members) then raise exception 'FUITE : un inscrit sans groupe voit des membres'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'un inscrit sans groupe doit voir sa fiche, et elle seule'; end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  Anonyme : seulement les deux aperçus
-- ------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  if exists (select 1 from public.events) then raise exception 'FUITE : anonyme voit un event'; end if;
  if exists (select 1 from public.groups) then raise exception 'FUITE : anonyme voit un groupe'; end if;
  if exists (select 1 from public.profiles) then raise exception 'FUITE : anonyme voit une fiche'; end if;
  if (select status from public.invite_preview('aaaaaaaa-0000-0000-0000-0000000000c1')) <> 'ok' then raise exception 'aperçu d''invitation'; end if;
  if (select group_name from public.invite_preview('aaaaaaaa-0000-0000-0000-0000000000c1')) <> 'Groupe A' then raise exception 'aperçu d''invitation : nom'; end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  A-deux, membre de A : voit tout A, chez-soi compris
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.events) <> 1 then raise exception 'A-deux ne voit pas l''event de A'; end if;
  if (select count(*) from public.group_places('aaaaaaaa-0000-0000-0000-00000000000a')) <> 2 then raise exception 'A-deux ne voit pas les deux lieux de A'; end if;
  if exists (select 1 from public.places where name = 'Chez B-deux') then raise exception 'FUITE : A-deux voit le chez-soi de B-deux'; end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'A-deux doit voir les deux fiches de A'; end if;
  -- Il ne prend pas le pseudo d'un autre.
  begin
    update public.members set pseudo = 'a-UN' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a2';
    raise exception 'deux pseudos identiques dans A';
  exception when unique_violation then null;
  end;
  -- Il ne modifie pas l'event de A-un, toujours membre.
  update public.events set title = 'x' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  if found then raise exception 'A-deux modifie l''event d''un autre'; end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  B-deux rejoint A, en masquant son chez-soi
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$
declare r text;
begin
  r := public.redeem_invite('aaaaaaaa-0000-0000-0000-0000000000c1', 'a-deux', '{}');
  if r <> 'pseudo_taken' then raise exception 'pseudo pris non détecté : %', r; end if;

  r := public.redeem_invite('aaaaaaaa-0000-0000-0000-0000000000c1', 'B-deux', array['aaaaaaaa-0000-0000-0000-0000000000f3'::uuid]);
  if r <> 'ok' then raise exception 'B-deux ne rejoint pas A : %', r; end if;

  r := public.redeem_invite('aaaaaaaa-0000-0000-0000-0000000000c1', 'B-deux', '{}');
  if r <> 'already' then raise exception 'second passage : %', r; end if;

  if (select count(*) from public.groups) <> 2 then raise exception 'B-deux doit voir ses deux groupes'; end if;
  if (select count(*) from public.events) <> 2 then raise exception 'B-deux doit voir les events de ses deux groupes'; end if;
  -- Le chez-soi de A-un le suit dans A, donc B-deux le voit.
  if not exists (select 1 from public.group_places('aaaaaaaa-0000-0000-0000-00000000000a') where name = 'Chez A-un') then
    raise exception 'B-deux ne voit pas le chez-soi de A-un dans A';
  end if;
  -- Son propre chez-soi est masqué dans A.
  if exists (select 1 from public.group_places('aaaaaaaa-0000-0000-0000-00000000000a') where name = 'Chez B-deux') then
    raise exception 'le chez-soi masqué apparaît dans A';
  end if;
  if not exists (select 1 from public.group_places('aaaaaaaa-0000-0000-0000-00000000000b') where name = 'Chez B-deux') then
    raise exception 'le chez-soi a disparu de B';
  end if;
end $$;

reset role;

-- Côté A-deux : le chez-soi masqué de B-deux reste invisible.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.places where name = 'Chez B-deux') then raise exception 'FUITE : chez-soi masqué visible de A-deux'; end if;
  if not exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000b2') then raise exception 'A-deux ne voit pas la fiche du nouveau'; end if;
  if exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000b1') then raise exception 'FUITE : A-deux voit B-un, qui n''est pas de A'; end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  A-un, admin de A, s'en va
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.leave_group('aaaaaaaa-0000-0000-0000-00000000000a');
    raise exception 'le dernier admin part sans passer la main';
  exception when raise_exception then
    if sqlerrm not like 'Nomme un autre admin%' then raise; end if;
  end;
  perform public.set_member_role('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'admin');
  perform public.leave_group('aaaaaaaa-0000-0000-0000-00000000000a');
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.event_rsvps where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') then
    raise exception 'les réponses à venir de A-un sont restées';
  end if;
  if not exists (select 1 from public.event_comments where author_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') then
    raise exception 'le commentaire de A-un a disparu';
  end if;
  if (select pseudo from public.departed where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') <> 'A-un' then
    raise exception 'le pseudo de A-un est perdu';
  end if;
  if exists (select 1 from public.places where name = 'Chez A-un') then raise exception 'le chez-soi de A-un est resté dans A'; end if;
  if not exists (select 1 from public.places where name = 'Bar de A') then raise exception 'le lieu ordinaire de A-un a disparu'; end if;
  -- L'admin reprend l'event et le lieu d'un parti.
  update public.events set title = 'Repris' where id = 'aaaaaaaa-0000-0000-0000-0000000000e1';
  if not found then raise exception 'l''admin ne peut pas reprendre l''event d''un parti'; end if;
  update public.places set door_code = '0000' where name = 'Bar de A';
  if not found then raise exception 'l''admin ne peut pas reprendre le lieu d''un parti'; end if;
end $$;

reset role;


-- ------------------------------------------------------------
--  Créer des groupes : cinq au plus
-- ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

do $$
declare
  g uuid;
  i int;
begin
  begin
    perform public.create_group('Trop peu', '{soiree,sport}', 'Moi');
    raise exception 'groupe à deux catégories accepté';
  exception when check_violation then null;
  end;
  g := public.create_group('Nouveau', '{soiree,sport,resto}', 'Moi');
  if not public.is_admin_of(g) then raise exception 'le créateur n''est pas admin'; end if;
  for i in 2..5 loop perform public.create_group('G' || i, '{soiree,sport,resto}', 'Moi'); end loop;
  begin
    perform public.create_group('G6', '{soiree,sport,resto}', 'Moi');
    raise exception 'sixième groupe accepté';
  exception when raise_exception then
    if sqlerrm not like 'Tu as déjà créé 5 groupes%' then raise; end if;
  end;
  -- Seul dans son groupe, on peut partir : le groupe part avec.
  perform public.leave_group(g);
end $$;

reset role;

do $$
begin
  if (select count(*) from public.groups where created_by = 'aaaaaaaa-0000-0000-0000-0000000000ff') <> 4 then
    raise exception 'le groupe vide est resté';
  end if;
end $$;

-- Le SQL Editor n'affiche que le dernier tableau, pas les NOTICE : on
-- finit donc par une ligne lisible. Une fuite, elle, arrête tout avant.
select 'Étanchéité : tout est OK' as resultat;

rollback;
