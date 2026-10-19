-- ============================================================
--  HUB Events — plusieurs groupes dans une même base
--
--  Jusqu'ici, une base = un groupe, et is_member() suffisait à
--  tout garder. Désormais chaque groupe a sa ligne dans groups,
--  et tout ce qui appartient à un groupe porte son group_id :
--  events, idées, invitations, lieux. Ce qui pend à un event
--  (réponses, commentaires, sondages…) suit le groupe de l'event.
--
--  Les données existantes deviennent le groupe « CDM », avec
--  tous ses membres. Le plus ancien en est l'admin.
--
--  Restent attachés à la personne, et visibles de quiconque
--  partage un groupe avec elle : la fiche (anniv, réglages).
--  Le pseudo, lui, se choisit groupe par groupe.
--
--  Les indispos disparaissent.
--
--  À appliquer d'un bloc : elle casse l'ancien code, qui doit
--  partir en même temps.
-- ============================================================

begin;


-- ------------------------------------------------------------
--  1. Les groupes
-- ------------------------------------------------------------

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 40),
  -- Facultatif : sans emoji, la pastille montre les initiales.
  emoji      text check (emoji is null or length(emoji) <= 16),
  tagline    text check (tagline is null or length(tagline) <= 280),
  -- Les villes proposées, dans l'ordre : [{"name":"Paris","emoji":"🗼"}].
  -- Vide : le filtre par ville disparaît de l'appli.
  cities     jsonb not null default '[]'::jsonb check (jsonb_typeof(cities) = 'array'),
  -- Clés du catalogue (lib/catalog.ts). « autre » est toujours offert en
  -- plus, et ne compte pas.
  categories text[] not null
             check (cardinality(categories) between 3 and 10
                    and array_to_string(categories, ',') ~ '^[a-z_]+(,[a-z_]+)*$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index groups_creator_idx on public.groups (created_by);

alter table public.groups enable row level security;


-- ------------------------------------------------------------
--  2. Les membres, groupe par groupe
-- ------------------------------------------------------------

alter table public.members
  add column group_id uuid references public.groups (id) on delete cascade,
  add column pseudo   text,
  add column role     text not null default 'member' check (role in ('admin', 'member')),
  -- « Couper ce groupe » : plus aucune notification venue de lui.
  add column muted    boolean not null default false;


-- ------------------------------------------------------------
--  3. Ce qui appartient à un groupe
-- ------------------------------------------------------------

alter table public.events    add column group_id uuid references public.groups (id) on delete cascade;
alter table public.proposals add column group_id uuid references public.groups (id) on delete cascade;
alter table public.invites   add column group_id uuid references public.groups (id) on delete cascade;
alter table public.places    add column group_id uuid references public.groups (id) on delete cascade;

-- « C'est chez moi » : le lieu suit son propriétaire dans tous ses groupes,
-- y compris ceux qu'il rejoindra. Sinon il reste dans son groupe d'origine.
alter table public.places add column is_home boolean not null default false;

-- Ceux qui sont partis. Leurs events et commentaires restent : sans leur
-- pseudo, ils seraient signés « quelqu'un ».
create table public.departed (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  pseudo   text not null,
  left_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.departed enable row level security;

-- Un chez-soi qu'on ne veut pas montrer à un groupe en particulier.
create table public.place_hidden (
  place_id uuid not null references public.places (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (place_id, group_id)
);

alter table public.place_hidden enable row level security;


-- ------------------------------------------------------------
--  4. Le CDM devient le premier groupe
--
--  Ses villes et sa phrase d'accueil vivaient dans les variables
--  Vercel ; elles passent en base, avec leurs valeurs actuelles.
-- ------------------------------------------------------------

do $$
declare
  cdm uuid;
begin
  -- Une base neuve n'a rien à reprendre : son premier groupe naîtra de
  -- create_group().
  if not exists (select 1 from public.members) then return; end if;

  insert into public.groups (name, tagline, cities, categories, created_by)
  values (
    'CDM',
    'Pour retrouver tous les évènements organisés par le CDM, du voyage annuel au ski jusqu''à la coinche du mardi où Kenny est encore le pire joueur autour de la table.',
    '[{"name":"Toulouse","emoji":"🌸"},{"name":"Bordeaux","emoji":"🍷"},{"name":"Paris","emoji":"🗼"},{"name":"Casablanca","emoji":"🕌"},{"name":"Rome","emoji":"🏛️"}]'::jsonb,
    array['soiree', 'sport', 'resto', 'picnic', 'voyage', 'coinche'],
    (select user_id from public.members order by added_at limit 1)
  )
  returning id into cdm;

  update public.members m
  set group_id = cdm, pseudo = trim(p.pseudo)
  from public.profiles p
  where p.id = m.user_id;

  -- Le premier arrivé a monté le groupe : il en est l'admin.
  update public.members set role = 'admin'
  where user_id = (select user_id from public.members order by added_at limit 1);

  update public.events    set group_id = cdm;
  update public.proposals set group_id = cdm;
  update public.invites   set group_id = cdm;
  update public.places    set group_id = cdm;
end $$;

alter table public.members   alter column group_id set not null, alter column pseudo set not null;
alter table public.events    alter column group_id set not null;
alter table public.proposals alter column group_id set not null;
alter table public.invites   alter column group_id set not null;
alter table public.places    alter column group_id set not null;

alter table public.members
  add constraint members_pseudo_check check (length(trim(pseudo)) between 2 and 40);

-- Une ligne par personne et par groupe.
alter table public.members drop constraint members_pkey;
alter table public.members add primary key (group_id, user_id);
create index members_user_idx on public.members (user_id);

-- Deux « Léo » dans un même groupe ne se distinguent plus. Le nom de
-- l'index remonte dans l'erreur : l'appli le reconnaît pour en faire une
-- phrase.
create unique index members_group_pseudo_key on public.members (group_id, lower(trim(pseudo)));

create index events_group_idx    on public.events (group_id);
create index proposals_group_idx on public.proposals (group_id);
create index invites_group_idx   on public.invites (group_id);
create index places_group_idx    on public.places (group_id);


-- ------------------------------------------------------------
--  5. Catégories : le catalogue sort de la base
--
--  La liste vit dans lib/catalog.ts, et chaque groupe choisit
--  la sienne. La base ne garde qu'une forme de clé.
-- ------------------------------------------------------------

alter table public.events    drop constraint events_category_check;
alter table public.proposals drop constraint proposals_category_check;
alter table public.events    add constraint events_category_check    check (category ~ '^[a-z_]+$');
alter table public.proposals add constraint proposals_category_check check (category ~ '^[a-z_]+$');


-- ------------------------------------------------------------
--  6. Les indispos s'en vont
-- ------------------------------------------------------------

drop table public.availability;


-- ------------------------------------------------------------
--  7. Ce qui ne bouge plus une fois écrit
--
--  Les politiques disent qui peut modifier une ligne, pas quelles
--  colonnes. Sans ce garde-fou, déplacer un event vers un autre
--  groupe, ou s'en approprier un, serait une simple mise à jour.
-- ------------------------------------------------------------

create function public.keep_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c text;
begin
  foreach c in array tg_argv loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'La colonne % ne se modifie pas.', c;
    end if;
  end loop;
  return new;
end $$;

create trigger events_keep    before update on public.events    for each row execute function public.keep_columns('group_id', 'created_by');
create trigger proposals_keep before update on public.proposals for each row execute function public.keep_columns('group_id', 'created_by');
create trigger invites_keep   before update on public.invites   for each row execute function public.keep_columns('group_id', 'created_by');
create trigger places_keep    before update on public.places    for each row execute function public.keep_columns('group_id', 'owner_id');
create trigger members_keep   before update on public.members   for each row execute function public.keep_columns('group_id', 'user_id');


-- ------------------------------------------------------------
--  8. Les questions que posent les politiques
--
--  security definer : elles lisent members et events en ignorant
--  le RLS, sinon une politique de members s'appellerait elle-même.
--  Chacune ne répond que par oui, non, ou un identifiant.
-- ------------------------------------------------------------

create function public.is_member_of(g uuid)
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (select 1 from public.members where group_id = g and user_id = auth.uid());
$$;

create function public.is_admin_of(g uuid)
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (select 1 from public.members where group_id = g and user_id = auth.uid() and role = 'admin');
$$;

-- N'importe quel compte, pas seulement l'appelant : sert à savoir si
-- l'auteur d'un event est encore là.
create function public.in_group(g uuid, u uuid)
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (select 1 from public.members where group_id = g and user_id = u);
$$;

create function public.shares_group_with(u uuid)
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.members a
    join public.members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

create function public.event_group(e uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select group_id from public.events where id = e;
$$;

create function public.date_option_group(o uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select e.group_id from public.date_options d join public.events e on e.id = d.event_id where d.id = o;
$$;

create function public.place_option_group(o uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select e.group_id from public.place_options d join public.events e on e.id = d.event_id where d.id = o;
$$;

create function public.proposal_group(p uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select group_id from public.proposals where id = p;
$$;

create function public.event_creator(e uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select created_by from public.events where id = e;
$$;

-- Un chez-soi se voit dans tout groupe partagé avec son propriétaire,
-- sauf ceux où il l'a masqué.
create function public.home_visible(place uuid, owner uuid)
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.members mo
    join public.members mv on mv.group_id = mo.group_id
    where mo.user_id = owner and mv.user_id = auth.uid()
      and not exists (
        select 1 from public.place_hidden h where h.place_id = place and h.group_id = mo.group_id
      )
  );
$$;

create function public.place_owner(place uuid)
returns uuid language sql security definer set search_path = '' stable
as $$
  select owner_id from public.places where id = place;
$$;


-- ============================================================
--  9. RLS
--
--  Toutes les politiques reposaient sur is_member(). On les
--  retire toutes, puis on reconstruit table par table.
-- ============================================================

do $$
declare
  p record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop function public.is_member();


-- -- groupes -------------------------------------------------
-- Créer passe par create_group(), qui fait aussi de vous l'admin.
create policy "un groupe se voit de ses membres"
  on public.groups for select using (public.is_member_of(id));

create policy "l'admin modifie son groupe"
  on public.groups for update
  using (public.is_admin_of(id)) with check (public.is_admin_of(id));

create policy "l'admin supprime son groupe"
  on public.groups for delete using (public.is_admin_of(id));

-- Ni created_by ni la date de création ne se réécrivent.
revoke update on public.groups from anon, authenticated;
grant update (name, emoji, tagline, cities, categories) on public.groups to authenticated;


-- -- membres -------------------------------------------------
-- Entrer, partir, changer de rôle : par les fonctions plus bas. Chacun
-- ne modifie directement que son pseudo et sa sourdine.
create policy "les membres d'un groupe se voient"
  on public.members for select using (public.is_member_of(group_id));

create policy "chacun règle sa ligne"
  on public.members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.members from anon, authenticated;
grant update (pseudo, muted) on public.members to authenticated;


create policy "les anciens d'un groupe se voient"
  on public.departed for select using (public.is_member_of(group_id));


-- -- fiches --------------------------------------------------
-- Sa propre fiche toujours, même sans groupe : sinon l'appli planterait
-- juste après l'inscription.
create policy "fiches visibles des groupes en commun"
  on public.profiles for select
  using (id = auth.uid() or public.shares_group_with(id));

create policy "chacun modifie sa fiche"
  on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());


-- -- events --------------------------------------------------
-- L'admin reprend la main sur les events d'un membre parti, et sur
-- ceux-là seulement.
create policy "events visibles du groupe"
  on public.events for select using (public.is_member_of(group_id));

create policy "un membre crée un event"
  on public.events for insert
  with check (public.is_member_of(group_id) and created_by = auth.uid());

create policy "le créateur modifie son event"
  on public.events for update
  using (public.is_member_of(group_id) and (
    created_by = auth.uid()
    or (public.is_admin_of(group_id) and not public.in_group(group_id, created_by))
  ))
  with check (public.is_member_of(group_id));

create policy "le créateur supprime son event"
  on public.events for delete
  using (public.is_member_of(group_id) and (
    created_by = auth.uid()
    or (public.is_admin_of(group_id) and not public.in_group(group_id, created_by))
  ));


-- -- réponses ------------------------------------------------
create policy "réponses visibles du groupe"
  on public.event_rsvps for select using (public.is_member_of(public.event_group(event_id)));

create policy "chacun répond pour soi"
  on public.event_rsvps for insert
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun change sa réponse"
  on public.event_rsvps for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun retire sa réponse"
  on public.event_rsvps for delete using (user_id = auth.uid());


-- -- commentaires --------------------------------------------
create policy "commentaires visibles du groupe"
  on public.event_comments for select using (public.is_member_of(public.event_group(event_id)));

create policy "un membre commente"
  on public.event_comments for insert
  with check (author_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun supprime son commentaire"
  on public.event_comments for delete using (author_id = auth.uid());


-- -- to-do et courses ----------------------------------------
-- Cocher reste un geste collectif.
create policy "tâches visibles du groupe"
  on public.event_todos for select using (public.is_member_of(public.event_group(event_id)));

create policy "un membre ajoute une tâche"
  on public.event_todos for insert
  with check (created_by = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "un membre coche une tâche"
  on public.event_todos for update
  using (public.is_member_of(public.event_group(event_id)))
  with check (public.is_member_of(public.event_group(event_id)));

create policy "l'auteur supprime sa tâche"
  on public.event_todos for delete using (created_by = auth.uid());


-- -- sondage de dates ----------------------------------------
create policy "créneaux visibles du groupe"
  on public.date_options for select using (public.is_member_of(public.event_group(event_id)));

create policy "un membre propose un créneau"
  on public.date_options for insert
  with check (added_by = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "l'auteur ou le créateur retire un créneau"
  on public.date_options for delete
  using (added_by = auth.uid() or public.event_creator(event_id) = auth.uid());

create policy "votes de dates visibles du groupe"
  on public.date_votes for select using (public.is_member_of(public.date_option_group(option_id)));

create policy "chacun vote une date"
  on public.date_votes for insert
  with check (user_id = auth.uid() and public.is_member_of(public.date_option_group(option_id)));

create policy "chacun retire son vote de date"
  on public.date_votes for delete using (user_id = auth.uid());


-- -- sondage de lieu -----------------------------------------
create policy "propositions de lieu visibles du groupe"
  on public.place_options for select using (public.is_member_of(public.event_group(event_id)));

create policy "un membre propose un lieu"
  on public.place_options for insert
  with check (added_by = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "l'auteur ou le créateur retire un lieu"
  on public.place_options for delete
  using (added_by = auth.uid() or public.event_creator(event_id) = auth.uid());

create policy "votes de lieu visibles du groupe"
  on public.place_votes for select using (public.is_member_of(public.place_option_group(option_id)));

create policy "chacun vote un lieu"
  on public.place_votes for insert
  with check (user_id = auth.uid() and public.is_member_of(public.place_option_group(option_id)));

create policy "chacun retire son vote de lieu"
  on public.place_votes for delete using (user_id = auth.uid());


-- -- transport -----------------------------------------------
create policy "trajets visibles du groupe"
  on public.event_transport for select using (public.is_member_of(public.event_group(event_id)));

create policy "chacun déclare son trajet"
  on public.event_transport for insert
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun modifie son trajet"
  on public.event_transport for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun retire son trajet"
  on public.event_transport for delete using (user_id = auth.uid());


-- -- hébergement ---------------------------------------------
create policy "hébergements visibles du groupe"
  on public.event_hosting for select using (public.is_member_of(public.event_group(event_id)));

create policy "chacun déclare son hébergement"
  on public.event_hosting for insert
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun modifie son hébergement"
  on public.event_hosting for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member_of(public.event_group(event_id)));

create policy "chacun retire son hébergement"
  on public.event_hosting for delete using (user_id = auth.uid());


-- -- idées ---------------------------------------------------
create policy "idées visibles du groupe"
  on public.proposals for select using (public.is_member_of(group_id));

create policy "un membre balance une idée"
  on public.proposals for insert
  with check (created_by = auth.uid() and public.is_member_of(group_id));

-- Large à dessein : transformer une idée en event renseigne promoted_to.
create policy "un membre met à jour une idée"
  on public.proposals for update
  using (public.is_member_of(group_id)) with check (public.is_member_of(group_id));

create policy "l'auteur supprime son idée"
  on public.proposals for delete using (created_by = auth.uid());

create policy "votes d'idées visibles du groupe"
  on public.proposal_votes for select using (public.is_member_of(public.proposal_group(proposal_id)));

create policy "chacun vote une idée"
  on public.proposal_votes for insert
  with check (user_id = auth.uid() and public.is_member_of(public.proposal_group(proposal_id)));

create policy "chacun retire son vote d'idée"
  on public.proposal_votes for delete using (user_id = auth.uid());


-- -- invitations ---------------------------------------------
-- Un inconnu qui devine un jeton ne lit rien ici : invite_preview et
-- redeem_invite sont ses seules portes.
create policy "invitations visibles du groupe"
  on public.invites for select using (public.is_member_of(group_id));

create policy "un membre invite"
  on public.invites for insert
  with check (created_by = auth.uid() and public.is_member_of(group_id));

create policy "l'auteur révoque son invitation"
  on public.invites for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());


-- -- lieux ---------------------------------------------------
-- Un lieu ordinaire reste dans son groupe, et l'admin en hérite si son
-- auteur s'en va. Un chez-soi suit son propriétaire, et part avec lui.
-- Un chez-soi ne passe jamais par son groupe d'origine : il partirait
-- sinon de ses autres groupes, et resterait dans celui qu'il a quitté.
create policy "lieux visibles"
  on public.places for select
  using (
    (not is_home and public.is_member_of(group_id))
    or (is_home and (owner_id = auth.uid() or public.home_visible(id, owner_id)))
  );

create policy "un membre ajoute un lieu"
  on public.places for insert
  with check (owner_id = auth.uid() and public.is_member_of(group_id));

create policy "le propriétaire modifie son lieu"
  on public.places for update
  using (
    owner_id = auth.uid()
    or (not is_home and public.is_admin_of(group_id) and not public.in_group(group_id, owner_id))
  )
  -- L'admin qui reprend un lieu n'en fait pas un chez-soi : il suivrait
  -- alors quelqu'un qui n'est plus là.
  with check (owner_id = auth.uid() or not is_home);

create policy "le propriétaire supprime son lieu"
  on public.places for delete
  using (
    owner_id = auth.uid()
    or (not is_home and public.is_admin_of(group_id) and not public.in_group(group_id, owner_id))
  );

create policy "chacun voit où il masque son chez-soi"
  on public.place_hidden for select using (public.place_owner(place_id) = auth.uid());

create policy "chacun masque son chez-soi"
  on public.place_hidden for insert
  with check (public.place_owner(place_id) = auth.uid() and public.in_group(group_id, auth.uid()));

create policy "chacun démasque son chez-soi"
  on public.place_hidden for delete using (public.place_owner(place_id) = auth.uid());


-- -- notifications -------------------------------------------
-- Inchangée, mais retirée avec les autres par la boucle ci-dessus.
create policy "ses propres abonnements"
  on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ============================================================
--  10. Les lieux d'un groupe
--
--  Ceux du groupe, plus le chez-soi de chacun de ses membres,
--  sauf s'il l'a masqué ici. security invoker : le RLS
--  s'applique en plus, la fonction ne fait que trier.
-- ============================================================

create function public.group_places(g uuid)
returns setof public.places
language sql
security invoker
set search_path = ''
stable
as $$
  select p.* from public.places p
  where (p.group_id = g and not p.is_home)
     or (p.is_home
         and public.in_group(g, p.owner_id)
         and not exists (select 1 from public.place_hidden h where h.place_id = p.id and h.group_id = g));
$$;


-- ============================================================
--  11. Entrer, partir, administrer
-- ============================================================

-- Le pseudo à proposer quand on entre dans un groupe : celui du dernier
-- groupe rejoint, à défaut celui de l'inscription.
create function public.default_pseudo(u uuid)
returns text language sql security definer set search_path = '' stable
as $$
  select coalesce(
    (select pseudo from public.members where user_id = u order by added_at desc limit 1),
    (select pseudo from public.profiles where id = u)
  );
$$;


/*
 * Ce qu'affiche un lien d'invitation, avant même d'avoir un compte : le
 * nom du groupe, et si le lien vaut encore quelque chose. Rien d'autre.
 */
create function public.invite_preview(token uuid)
returns table (group_name text, group_emoji text, status text, pseudo text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  inv public.invites%rowtype;
  me  uuid := auth.uid();
begin
  select * into inv from public.invites where id = token;
  if not found or inv.revoked then
    return query select null::text, null::text, 'invalid'::text, null::text;
    return;
  end if;

  return query
    select g.name, g.emoji,
      case
        when me is not null and exists (select 1 from public.members where group_id = g.id and user_id = me) then 'already'
        when inv.expires_at is not null and inv.expires_at < now() then 'expired'
        when inv.max_uses is not null and inv.uses >= inv.max_uses then 'used'
        else 'ok'
      end,
      case when me is null then null else public.default_pseudo(me) end
    from public.groups g where g.id = inv.group_id;
end $$;


/*
 * Consommer un jeton. security definer : la fonction écrit dans members,
 * ce que les politiques interdisent à tout le monde. Elle ne le fait
 * qu'après avoir validé le jeton, et pour l'appelant seulement.
 *
 * hidden_places : ses chez-soi qu'on ne veut pas montrer à ce groupe.
 */
drop function public.redeem_invite(uuid);

create function public.redeem_invite(token uuid, pseudo text default null, hidden_places uuid[] default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv  public.invites%rowtype;
  me   uuid := auth.uid();
  nick text;
begin
  if me is null then return 'anon'; end if;

  -- for update : deux amis qui cliquent en même temps ne peuvent pas
  -- dépasser ensemble le nombre d'usages autorisé.
  select * into inv from public.invites where id = token for update;

  if not found or inv.revoked then return 'invalid'; end if;
  if exists (select 1 from public.members where group_id = inv.group_id and user_id = me) then return 'already'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then return 'expired'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then return 'used'; end if;

  nick := trim(coalesce(nullif(trim(redeem_invite.pseudo), ''), public.default_pseudo(me)));
  if length(nick) not between 2 and 40 then return 'pseudo_invalid'; end if;
  if exists (
    select 1 from public.members
    where group_id = inv.group_id and lower(trim(members.pseudo)) = lower(nick)
  ) then
    return 'pseudo_taken';
  end if;

  insert into public.members (group_id, user_id, pseudo) values (inv.group_id, me, nick);
  -- Revenu après un départ : il n'est plus un ancien.
  delete from public.departed where group_id = inv.group_id and user_id = me;
  update public.invites set uses = uses + 1 where id = inv.id;

  insert into public.place_hidden (place_id, group_id)
  select p.id, inv.group_id from public.places p
  where p.id = any (hidden_places) and p.owner_id = me and p.is_home
  on conflict do nothing;

  return 'ok';
end $$;


/*
 * Créer un groupe, et en devenir l'admin. Cinq au plus par compte : une
 * barrière contre un abus ou un bug, pas contre un usage normal.
 */
create function public.create_group(
  name text,
  categories text[],
  pseudo text,
  emoji text default null,
  tagline text default null,
  cities jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  gid uuid;
  nick text := trim(coalesce(create_group.pseudo, ''));
begin
  if me is null then raise exception 'Session expirée.'; end if;
  if (select count(*) from public.groups where created_by = me) >= 5 then
    raise exception 'Tu as déjà créé 5 groupes.';
  end if;
  if length(nick) not between 2 and 40 then raise exception 'Ton pseudo doit faire de 2 à 40 caractères.'; end if;

  insert into public.groups (name, emoji, tagline, cities, categories, created_by)
  values (trim(create_group.name), nullif(trim(create_group.emoji), ''), nullif(trim(create_group.tagline), ''),
          coalesce(create_group.cities, '[]'::jsonb), create_group.categories, me)
  returning id into gid;

  insert into public.members (group_id, user_id, pseudo, role) values (gid, me, nick, 'admin');
  return gid;
end $$;


/* L'admin nomme ou destitue. Il reste toujours au moins un admin. */
create function public.set_member_role(g uuid, u uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_of(g) then raise exception 'Réservé à l''admin du groupe.'; end if;
  if new_role not in ('admin', 'member') then raise exception 'Rôle inconnu.'; end if;
  if new_role = 'member'
     and not exists (select 1 from public.members where group_id = g and role = 'admin' and user_id <> u) then
    raise exception 'Il faut au moins un admin dans le groupe.';
  end if;
  update public.members set role = new_role where group_id = g and user_id = u;
end $$;


/* L'admin retire quelqu'un. Pour partir soi-même, c'est leave_group. */
create function public.remove_member(g uuid, u uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_of(g) then raise exception 'Réservé à l''admin du groupe.'; end if;
  if u = auth.uid() then raise exception 'Pour partir, quitte le groupe.'; end if;
  delete from public.members where group_id = g and user_id = u;
end $$;


/*
 * Quitter un groupe. Le dernier admin doit d'abord passer la main — sauf
 * s'il est seul, et alors le groupe part avec lui (voir after_member_left).
 */
create function public.leave_group(g uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Session expirée.'; end if;
  if public.is_admin_of(g)
     and not exists (select 1 from public.members where group_id = g and role = 'admin' and user_id <> me)
     and exists (select 1 from public.members where group_id = g and user_id <> me) then
    raise exception 'Nomme un autre admin avant de partir.';
  end if;
  delete from public.members where group_id = g and user_id = me;
end $$;


/*
 * Après tout départ — quitter, être retiré, supprimer son compte :
 *   · ses réponses aux events à venir du groupe s'effacent, pour que le
 *     compte de qui vient reste juste ; le reste de ce qu'il a écrit reste
 *   · un groupe vide disparaît
 *   · un groupe sans admin en reçoit un : le plus ancien membre
 */
create function public.after_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le groupe lui-même est en train de partir : rien à rattraper.
  if not exists (select 1 from public.groups where id = old.group_id) then return null; end if;

  -- Sa fiche, elle, peut être en train de partir (compte supprimé) : il
  -- n'y a alors plus rien à signer.
  if exists (select 1 from public.profiles where id = old.user_id) then
    insert into public.departed (group_id, user_id, pseudo) values (old.group_id, old.user_id, old.pseudo)
    on conflict (group_id, user_id) do update set pseudo = excluded.pseudo, left_at = now();
  end if;

  delete from public.event_rsvps r
  using public.events e
  where r.event_id = e.id
    and e.group_id = old.group_id
    and r.user_id = old.user_id
    and (coalesce(e.ends_on, e.starts_on) is null or coalesce(e.ends_on, e.starts_on) >= current_date);

  if not exists (select 1 from public.members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
    return null;
  end if;

  if not exists (select 1 from public.members where group_id = old.group_id and role = 'admin') then
    update public.members set role = 'admin'
    where group_id = old.group_id
      and user_id = (select user_id from public.members where group_id = old.group_id order by added_at limit 1);
  end if;

  return null;
end $$;

create trigger member_left
  after delete on public.members
  for each row execute function public.after_member_left();


-- ============================================================
--  12. Les notifications, groupe par groupe
--
--  Chaque fonction ne vise plus que les membres du groupe de
--  l'event, et saute ceux qui l'ont coupé. Elles renvoient en
--  plus un préfixe : le nom du groupe, pour qui en a plusieurs,
--  vide sinon.
--
--  Le type de retour change : il faut les recréer.
-- ============================================================

create function public.group_prefix(g uuid, u uuid)
returns text language sql security definer set search_path = '' stable
as $$
  select case
    when (select count(*) from public.members where user_id = u) > 1
      then (select name from public.groups where id = g)
    else ''
  end;
$$;

drop function public.push_targets_for_event(uuid);
drop function public.push_targets_for_author(uuid);
drop function public.push_targets_for_attendees(uuid);
drop function public.nudge_event(uuid);
drop function public.digest_pending(text);
drop function public.event_preview(uuid);


-- Règles 1 et 2 : un big event pour tout le groupe, un plan du quotidien
-- pour ceux qui suivent sa ville.
create function public.push_targets_for_event(event_id uuid)
returns table (endpoint text, p256dh text, auth text, prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  select * into ev from public.events where id = push_targets_for_event.event_id;
  if not found or not public.is_member_of(ev.group_id) then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth, public.group_prefix(ev.group_id, s.user_id)
    from public.members m
    join public.profiles p           on p.id = m.user_id
    join public.push_subscriptions s on s.user_id = m.user_id
    where m.group_id = ev.group_id
      and not m.muted
      and m.user_id <> me
      and (
        (ev.scale = 'big' and p.notify_big)
        or (ev.scale <> 'big' and ev.city is not null
            and p.notify_city and ev.city = any (p.notify_cities))
      );
end $$;


-- Règle 3 : l'auteur de l'event, s'il est encore du groupe.
create function public.push_targets_for_author(event_id uuid)
returns table (endpoint text, p256dh text, auth text, prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  select * into ev from public.events where id = push_targets_for_author.event_id;
  if not found or not public.is_member_of(ev.group_id) then return; end if;
  if ev.created_by is null or ev.created_by = me then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth, public.group_prefix(ev.group_id, s.user_id)
    from public.members m
    join public.profiles p           on p.id = m.user_id
    join public.push_subscriptions s on s.user_id = m.user_id
    where m.group_id = ev.group_id
      and m.user_id = ev.created_by
      and not m.muted
      and p.notify_mine;
end $$;


-- Règle 4 : les gens chauds sur un plan qui bouge.
create function public.push_targets_for_attendees(event_id uuid)
returns table (endpoint text, p256dh text, auth text, prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g  uuid;
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  g := public.event_group(push_targets_for_attendees.event_id);
  if g is null or not public.is_member_of(g) then return; end if;

  return query
    select s.endpoint, s.p256dh, s.auth, public.group_prefix(g, s.user_id)
    from public.event_rsvps r
    join public.members m            on m.group_id = g and m.user_id = r.user_id
    join public.profiles p           on p.id = r.user_id
    join public.push_subscriptions s on s.user_id = r.user_id
    where r.event_id = push_targets_for_attendees.event_id
      and r.status = 'in'
      and r.user_id <> me
      and not m.muted
      and p.notify_joined;
end $$;


-- La relance : le droit, le délai et les destinataires, en une transaction.
create function public.nudge_event(event_id uuid)
returns table (endpoint text, p256dh text, auth text, prefix text)
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
  if not found or ev.created_by <> me or not public.is_member_of(ev.group_id) then
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
    select s.endpoint, s.p256dh, s.auth, public.group_prefix(ev.group_id, s.user_id)
    from public.members m
    join public.profiles p           on p.id = m.user_id
    join public.push_subscriptions s on s.user_id = m.user_id
    left join public.event_rsvps r   on r.event_id = ev.id and r.user_id = m.user_id
    where m.group_id = ev.group_id
      and m.user_id <> me
      and not m.muted
      and (r.status is null or r.status = 'maybe')
      and p.notify_nudge;
end $$;


-- Le récapitulatif du matin, sur les plans des groupes dont on est encore.
create function public.digest_pending(secret text)
returns table (endpoint text, p256dh text, auth text, event_id uuid, title text, joined integer, prefix text)
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
    select s.endpoint, s.p256dh, s.auth, e.id, e.title, cnt.n, public.group_prefix(e.group_id, mine.user_id)
    from public.event_rsvps mine
    join public.events e             on e.id = mine.event_id
    join public.members m            on m.group_id = e.group_id and m.user_id = mine.user_id
    join public.profiles p           on p.id = mine.user_id
    join public.push_subscriptions s on s.user_id = mine.user_id
    join lateral (
      select count(*)::int as n
      from public.event_rsvps r
      where r.event_id = e.id
        and r.status = 'in'
        and r.user_id <> mine.user_id
        and r.updated_at > now() - interval '24 hours'
    ) cnt on cnt.n > 0
    where mine.status = 'in'
      and not m.muted
      and p.notify_digest
      and (e.starts_on is null or e.starts_on >= current_date);
end $$;


/*
 * Les anniversaires du jour. Une notification par personne fêtée, même
 * si l'on partage plusieurs groupes avec elle ; son pseudo est celui du
 * groupe partagé depuis le plus longtemps. Un groupe coupé ne compte pas.
 */
create or replace function public.birthdays_pending(secret text)
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
    with fetes as (
      select b.id, b.birthday from public.profiles b
      where b.birthday is not null
        and (
          (extract(month from b.birthday) = extract(month from today)
           and extract(day from b.birthday) = extract(day from today))
          or (not leap
              and extract(month from b.birthday) = 2 and extract(day from b.birthday) = 29
              and extract(month from today) = 2 and extract(day from today) = 28)
        )
    ),
    paires as (
      select distinct on (f.id, m.user_id)
        f.id as fete, m.user_id as dest, bm.pseudo,
        (extract(year from today) - extract(year from f.birthday))::int as age
      from fetes f
      join public.members bm on bm.user_id = f.id
      join public.members m  on m.group_id = bm.group_id and m.user_id <> f.id and not m.muted
      order by f.id, m.user_id, greatest(bm.added_at, m.added_at)
    )
    select s.endpoint, s.p256dh, s.auth, x.pseudo, x.age
    from paires x
    join public.profiles p           on p.id = x.dest
    join public.push_subscriptions s on s.user_id = x.dest
    where p.notify_birthday;
end $$;


/*
 * L'aperçu public d'un event : titre, dates, et désormais le nom du
 * groupe, que la page montre à qui n'en est pas. Rien d'autre.
 */
create function public.event_preview(event_id uuid)
returns table (title text, starts_on date, ends_on date, group_id uuid, group_name text, group_emoji text)
language sql
security definer
set search_path = ''
stable
as $$
  select e.title, e.starts_on, e.ends_on, g.id, g.name, g.emoji
  from public.events e
  join public.groups g on g.id = e.group_id
  where e.id = event_preview.event_id;
$$;


-- ------------------------------------------------------------
--  Droits d'exécution
-- ------------------------------------------------------------

revoke execute on function public.push_targets_for_event(uuid)                 from public;
revoke execute on function public.push_targets_for_author(uuid)                from public;
revoke execute on function public.push_targets_for_attendees(uuid)             from public;
revoke execute on function public.nudge_event(uuid)                            from public;
revoke execute on function public.digest_pending(text)                         from public;
revoke execute on function public.event_preview(uuid)                          from public;
revoke execute on function public.invite_preview(uuid)                         from public;
revoke execute on function public.redeem_invite(uuid, text, uuid[])            from public;
revoke execute on function public.create_group(text, text[], text, text, text, jsonb) from public;
revoke execute on function public.set_member_role(uuid, uuid, text)            from public;
revoke execute on function public.remove_member(uuid, uuid)                    from public;
revoke execute on function public.leave_group(uuid)                            from public;
revoke execute on function public.group_places(uuid)                           from public;
revoke execute on function public.default_pseudo(uuid)                         from public;
revoke execute on function public.group_prefix(uuid, uuid)                     from public;

grant execute on function public.push_targets_for_event(uuid)                 to authenticated;
grant execute on function public.push_targets_for_author(uuid)                to authenticated;
grant execute on function public.push_targets_for_attendees(uuid)             to authenticated;
grant execute on function public.nudge_event(uuid)                            to authenticated;
-- C'est le secret qui garde la porte : la tâche du matin n'a pas de session.
grant execute on function public.digest_pending(text)                         to anon, authenticated;
-- anon compris : un aperçu se lit sans compte, c'est tout leur objet.
grant execute on function public.event_preview(uuid)                          to anon, authenticated;
grant execute on function public.invite_preview(uuid)                         to anon, authenticated;
grant execute on function public.redeem_invite(uuid, text, uuid[])            to authenticated;
grant execute on function public.create_group(text, text[], text, text, text, jsonb) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text)            to authenticated;
grant execute on function public.remove_member(uuid, uuid)                    to authenticated;
grant execute on function public.leave_group(uuid)                            to authenticated;
grant execute on function public.group_places(uuid)                           to authenticated;

commit;
