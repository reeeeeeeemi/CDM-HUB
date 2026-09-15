-- ============================================================
--  HUB Events — schéma complet, pour une base NEUVE
--
--  Les huit migrations dans l'ordre, concaténées. À coller en
--  une fois dans le SQL Editor d'un projet Supabase vide.
--
--  Ne pas lancer sur une base existante : plusieurs `create
--  table` échoueraient, et rien ne serait appliqué.
--
--  Généré depuis supabase/migrations/ — la source reste ces
--  fichiers, c'est là qu'il faut ajouter toute suite.
-- ============================================================



-- ==========================================================
--  0001_schema.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — schéma initial
--
--  Reprend le modèle du prototype app/crew-hub.jsx :
--  events, proposals, availability, et tout ce qui pend
--  à un event (rsvps, commentaires, todos, sondage de dates,
--  transport).
--
--  Le groupe est privé : la table members sert de liste
--  d'invités. Tant qu'on n'y est pas, on ne voit rien.
-- ============================================================


-- ------------------------------------------------------------
--  1. Qui est qui
-- ------------------------------------------------------------

-- Une fiche par compte. auth.users garde l'email et le mot de
-- passe ; ici on ne met que ce qui s'affiche dans l'appli.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  pseudo     text not null,
  avatar_url text,
  city       text,
  created_at timestamptz not null default now()
);

-- La liste du groupe. Une ligne = un ami autorisé.
create table public.members (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Utilisé par toutes les politiques ci-dessous.
-- security definer : la fonction lit members en ignorant le RLS,
-- sinon la politique de members s'appellerait elle-même.
create function public.is_member()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- Crée la fiche automatiquement à l'inscription.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, pseudo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'pseudo', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
--  2. Les events
-- ------------------------------------------------------------

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  category    text not null default 'autre'
              check (category in ('soiree','sport','resto','picnic','voyage','chill','autre')),
  scale       text not null default 'daily' check (scale in ('big','daily')),
  city        text,

  -- Vides tant que la date se vote dans date_poll_options.
  starts_on   date,
  ends_on     date,
  starts_at   time,
  ends_at     time,

  place       text,
  description text,
  links       text[] not null default '{}',

  -- Quels blocs sont affichés : transport, datePoll, todos, comments.
  modules     jsonb not null default '{"transport":true,"datePoll":true,"todos":true,"comments":true}'::jsonb,

  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index events_city_idx    on public.events (city);
create index events_starts_idx  on public.events (starts_on);
create index events_creator_idx on public.events (created_by);

-- Je viens / peut-être / pas dispo. Une réponse par personne.
create table public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('in','maybe','out')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index event_comments_event_idx on public.event_comments (event_id, created_at);

create table public.event_todos (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  label      text not null check (length(trim(label)) > 0),
  done       boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index event_todos_event_idx on public.event_todos (event_id);


-- ------------------------------------------------------------
--  3. Le sondage de dates
-- ------------------------------------------------------------

create table public.date_options (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  on_date  date not null,
  at_time  time,
  unique (event_id, on_date, at_time)
);

create index date_options_event_idx on public.date_options (event_id);

-- Le prototype stocke un tableau de noms ; une ligne par vote
-- se compte et se dédoublonne tout seul.
create table public.date_votes (
  option_id uuid not null references public.date_options (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (option_id, user_id)
);


-- ------------------------------------------------------------
--  4. Le transport
-- ------------------------------------------------------------

create table public.event_transport (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  mode     text not null check (mode in ('voiture','covoit','train','avion','autre')),
  seats    smallint not null default 0 check (seats >= 0),
  note     text,
  primary key (event_id, user_id)
);


-- ------------------------------------------------------------
--  5. Les idées en attente
-- ------------------------------------------------------------

create table public.proposals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) > 0),
  category   text not null default 'autre'
             check (category in ('soiree','sport','resto','picnic','voyage','chill','autre')),
  scale      text not null default 'daily' check (scale in ('big','daily')),
  city       text,
  note       text,
  -- Renseigné quand l'idée devient un event.
  promoted_to uuid references public.events (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.proposal_votes (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  primary key (proposal_id, user_id)
);


-- ------------------------------------------------------------
--  6. Les indispos
-- ------------------------------------------------------------

create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  note       text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index availability_user_idx  on public.availability (user_id);
create index availability_range_idx on public.availability (starts_on, ends_on);


-- ============================================================
--  7. RLS
--
--  Porte fermée partout, puis on rouvre.
--  Lecture  : réservée aux membres du groupe.
--  Écriture : chacun ne touche que ce qu'il a créé.
-- ============================================================

alter table public.profiles        enable row level security;
alter table public.members         enable row level security;
alter table public.events          enable row level security;
alter table public.event_rsvps     enable row level security;
alter table public.event_comments  enable row level security;
alter table public.event_todos     enable row level security;
alter table public.date_options    enable row level security;
alter table public.date_votes      enable row level security;
alter table public.event_transport enable row level security;
alter table public.proposals       enable row level security;
alter table public.proposal_votes  enable row level security;
alter table public.availability    enable row level security;


-- -- profiles ------------------------------------------------
-- Tout le monde voit sa propre fiche, même avant d'être invité,
-- sinon l'appli planterait juste après l'inscription.
create policy "profils du groupe visibles"
  on public.profiles for select
  using (public.is_member() or id = auth.uid());

create policy "chacun modifie sa fiche"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());


-- -- members -------------------------------------------------
-- Lecture seule depuis l'appli : on ajoute un ami à la main
-- dans le dashboard Supabase.
create policy "liste du groupe visible par le groupe"
  on public.members for select
  using (public.is_member());


-- -- events -------------------------------------------------
create policy "events visibles par le groupe"
  on public.events for select
  using (public.is_member());

create policy "un membre crée un event"
  on public.events for insert
  with check (public.is_member() and created_by = auth.uid());

create policy "le créateur modifie son event"
  on public.events for update
  using (public.is_member() and created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "le créateur supprime son event"
  on public.events for delete
  using (public.is_member() and created_by = auth.uid());


-- -- rsvps --------------------------------------------------
create policy "réponses visibles par le groupe"
  on public.event_rsvps for select
  using (public.is_member());

create policy "chacun répond pour soi"
  on public.event_rsvps for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun change sa réponse"
  on public.event_rsvps for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "chacun retire sa réponse"
  on public.event_rsvps for delete
  using (user_id = auth.uid());


-- -- commentaires -------------------------------------------
create policy "commentaires visibles par le groupe"
  on public.event_comments for select
  using (public.is_member());

create policy "un membre commente"
  on public.event_comments for insert
  with check (public.is_member() and author_id = auth.uid());

create policy "chacun supprime son commentaire"
  on public.event_comments for delete
  using (author_id = auth.uid());


-- -- todos --------------------------------------------------
-- Cocher une tâche est un geste collectif : n'importe quel
-- membre peut le faire, pas seulement celui qui l'a écrite.
create policy "todos visibles par le groupe"
  on public.event_todos for select
  using (public.is_member());

create policy "un membre ajoute une tâche"
  on public.event_todos for insert
  with check (public.is_member() and created_by = auth.uid());

create policy "un membre coche une tâche"
  on public.event_todos for update
  using (public.is_member())
  with check (public.is_member());

create policy "l'auteur supprime sa tâche"
  on public.event_todos for delete
  using (created_by = auth.uid());


-- -- sondage de dates ---------------------------------------
create policy "dates visibles par le groupe"
  on public.date_options for select
  using (public.is_member());

create policy "un membre propose une date"
  on public.date_options for insert
  with check (public.is_member());

create policy "votes visibles par le groupe"
  on public.date_votes for select
  using (public.is_member());

create policy "chacun vote pour soi"
  on public.date_votes for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun retire son vote"
  on public.date_votes for delete
  using (user_id = auth.uid());


-- -- transport ----------------------------------------------
create policy "transport visible par le groupe"
  on public.event_transport for select
  using (public.is_member());

create policy "chacun déclare son trajet"
  on public.event_transport for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun modifie son trajet"
  on public.event_transport for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "chacun retire son trajet"
  on public.event_transport for delete
  using (user_id = auth.uid());


-- -- propositions -------------------------------------------
create policy "idées visibles par le groupe"
  on public.proposals for select
  using (public.is_member());

create policy "un membre balance une idée"
  on public.proposals for insert
  with check (public.is_member() and created_by = auth.uid());

-- Large à dessein : transformer une idée en event renseigne
-- promoted_to, et ce n'est pas réservé à son auteur.
create policy "un membre met à jour une idée"
  on public.proposals for update
  using (public.is_member())
  with check (public.is_member());

create policy "l'auteur supprime son idée"
  on public.proposals for delete
  using (created_by = auth.uid());

create policy "votes d'idées visibles par le groupe"
  on public.proposal_votes for select
  using (public.is_member());

create policy "chacun vote une idée"
  on public.proposal_votes for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun retire son vote d'idée"
  on public.proposal_votes for delete
  using (user_id = auth.uid());


-- -- indispos -----------------------------------------------
-- Visibles par le groupe : c'est le but des Dispos, savoir
-- qui ne peut pas avant de caler une date.
create policy "indispos visibles par le groupe"
  on public.availability for select
  using (public.is_member());

create policy "chacun déclare ses indispos"
  on public.availability for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun modifie ses indispos"
  on public.availability for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "chacun supprime ses indispos"
  on public.availability for delete
  using (user_id = auth.uid());


-- ============================================================
--  8. Amorçage
--
--  Personne n'est membre au départ, donc is_member() est faux
--  pour tout le monde et l'appli reste vide. Après ta première
--  inscription, exécute ceci dans le SQL Editor pour t'ajouter :
--
--      insert into public.members (user_id)
--      select id from auth.users where email = 'ton@email';
--
--  Ensuite, un ami par ligne, au fur et à mesure.
-- ============================================================


-- ==========================================================
--  0002_place_polls_hosting.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — mise à jour du modèle
--
--  Aligne la base sur les évolutions de l'app :
--    · sondage de lieu sur les events quotidiens
--    · qui peut héberger, sur les big events
--    · To-Do et liste de courses, deux listes distinctes
--    · heure de départ / d'arrivée sur le transport
--    · plus d'heure sur le sondage de dates
--
--  À appliquer après 0001_schema.sql.
-- ============================================================


-- ------------------------------------------------------------
--  1. Sondage de lieu
-- ------------------------------------------------------------

create table public.place_options (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label    text not null check (length(trim(label)) > 0),
  -- Lien Google Maps, facultatif.
  url      text,
  added_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index place_options_event_idx on public.place_options (event_id);

create table public.place_votes (
  option_id uuid not null references public.place_options (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (option_id, user_id)
);

-- Le lieu retenu, quand le créateur fige une option.
alter table public.events add column place_url text;


-- ------------------------------------------------------------
--  2. Qui peut héberger
--
--  Jumelle de event_transport : une déclaration par personne,
--  soit on offre des places, soit on en cherche une.
-- ------------------------------------------------------------

create table public.event_hosting (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  seeking  boolean not null default false,
  spots    smallint not null default 0 check (spots >= 0),
  -- Chercher un lit et offrir des places sont exclusifs.
  check (not (seeking and spots > 0)),
  primary key (event_id, user_id)
);


-- ------------------------------------------------------------
--  3. To-Do et liste de courses
-- ------------------------------------------------------------

alter table public.event_todos
  add column kind text not null default 'todo' check (kind in ('todo', 'course'));

create index event_todos_kind_idx on public.event_todos (event_id, kind);


-- ------------------------------------------------------------
--  4. Heure de transport, et fin de l'heure sur les dates
-- ------------------------------------------------------------

-- Départ pour qui conduit, arrivée sur place pour le train et l'avion.
alter table public.event_transport add column at_time time;

-- La note libre a été retirée de l'interface.
alter table public.event_transport drop column note;

-- Le sondage de dates ne porte plus d'heure : la contrainte d'unicité
-- part avec la colonne, on la recrée sur la date seule.
alter table public.date_options drop column at_time;
alter table public.date_options add constraint date_options_event_date_key unique (event_id, on_date);


-- ============================================================
--  5. RLS sur les nouvelles tables
--
--  Même principe que dans 0001 : le groupe lit, chacun n'écrit
--  que sa propre ligne.
-- ============================================================

alter table public.place_options enable row level security;
alter table public.place_votes   enable row level security;
alter table public.event_hosting enable row level security;


-- -- sondage de lieu -----------------------------------------
create policy "lieux visibles par le groupe"
  on public.place_options for select
  using (public.is_member());

create policy "un membre propose un lieu"
  on public.place_options for insert
  with check (public.is_member() and added_by = auth.uid());

create policy "l'auteur supprime son lieu"
  on public.place_options for delete
  using (added_by = auth.uid());

create policy "votes de lieu visibles par le groupe"
  on public.place_votes for select
  using (public.is_member());

create policy "chacun vote un lieu"
  on public.place_votes for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun retire son vote de lieu"
  on public.place_votes for delete
  using (user_id = auth.uid());


-- -- hébergement ---------------------------------------------
create policy "hébergements visibles par le groupe"
  on public.event_hosting for select
  using (public.is_member());

create policy "chacun déclare son hébergement"
  on public.event_hosting for insert
  with check (public.is_member() and user_id = auth.uid());

create policy "chacun modifie son hébergement"
  on public.event_hosting for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "chacun retire son hébergement"
  on public.event_hosting for delete
  using (user_id = auth.uid());


-- ==========================================================
--  0003_categories.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — catégories
--
--  Coinche remplace Chill dans les activités proposées.
--  Les contraintes de 0001 listent les valeurs autorisées ;
--  il faut les refaire sur events et sur proposals.
-- ============================================================

-- Si des events en 'chill' existaient, on les bascule sur 'autre'
-- avant que la nouvelle contrainte ne les rejette.
update public.events    set category = 'autre' where category = 'chill';
update public.proposals set category = 'autre' where category = 'chill';

-- Le nom de la contrainte a été généré par Postgres. Plutôt que de le
-- deviner, on retire toute contrainte CHECK portant sur la colonne
-- category — sinon l'ancienne survivrait et continuerait de refuser
-- 'coinche', sans le moindre message.
do $$
declare
  c record;
begin
  for c in
    select rel.relname as tbl, con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('events', 'proposals')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%category%'
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.name);
    raise notice 'contrainte retirée : %.%', c.tbl, c.name;
  end loop;
end $$;

alter table public.events
  add constraint events_category_check
    check (category in ('soiree','sport','resto','picnic','voyage','coinche','autre'));

alter table public.proposals
  add constraint proposals_category_check
    check (category in ('soiree','sport','resto','picnic','voyage','coinche','autre'));


-- ==========================================================
--  0004_date_option_range.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — créneaux du sondage de dates
--
--  Un big event se vote sur une période, pas sur un jour :
--  « du lun 15 févr 2027 au ven 19 févr 2027 ».
--  Les events quotidiens continuent de n'avoir qu'une date.
-- ============================================================

alter table public.date_options add column end_date date;

-- Une fin antérieure au début n'a pas de sens.
alter table public.date_options
  add constraint date_options_range_check
    check (end_date is null or end_date >= on_date);

-- La contrainte d'unicité portait sur (event_id, on_date) : deux créneaux
-- partant du même jour mais finissant différemment doivent coexister.
alter table public.date_options drop constraint date_options_event_date_key;
alter table public.date_options
  add constraint date_options_event_range_key unique (event_id, on_date, end_date);


-- ------------------------------------------------------------
--  Retirer son propre créneau
--
--  0001 n'avait ni auteur ni politique de suppression : une fois
--  proposé, un créneau ne pouvait plus partir.
-- ------------------------------------------------------------

alter table public.date_options
  add column added_by uuid references public.profiles (id) on delete cascade;

create policy "l'auteur retire son créneau"
  on public.date_options for delete
  using (added_by = auth.uid());

-- Le créateur de l'event fait le ménage chez tout le monde.
create policy "le créateur retire un créneau"
  on public.date_options for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = date_options.event_id and e.created_by = auth.uid()
    )
  );

create policy "le créateur retire un lieu"
  on public.place_options for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = place_options.event_id and e.created_by = auth.uid()
    )
  );


-- ==========================================================
--  0005_align_with_app.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — derniers ajustements avant branchement
--
--  Deux écarts entre le schéma et ce que l'app manipule
--  réellement, invisibles tant que rien n'était branché.
-- ============================================================

-- Un lien n'est pas une chaîne : il porte un type, un libellé et une URL.
-- text[] ne peut pas les tenir.
alter table public.events
  alter column links drop default,
  alter column links type jsonb using to_jsonb(links),
  alter column links set default '[]'::jsonb;

-- Qui a coché la tâche — l'app l'affiche déjà (« pris par Léo »).
alter table public.event_todos
  add column done_by uuid references public.profiles (id) on delete set null;


-- ==========================================================
--  0006_invites.sql
-- ==========================================================

-- ============================================================
--  HUB Events CDM — liens d'invitation
--
--  members n'accepte aucune insertion : c'est ce qui garde le
--  hub privé. Rejoindre passe donc par un jeton, vérifié par
--  une fonction qui, elle seule, a le droit d'ajouter la ligne.
-- ============================================================

create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- null = sans limite d'usages
  max_uses   integer check (max_uses is null or max_uses > 0),
  uses       integer not null default 0,
  revoked    boolean not null default false
);

create index invites_creator_idx on public.invites (created_by, created_at desc);

alter table public.invites enable row level security;

-- Seul le groupe voit et crée des invitations. Un inconnu qui devine un
-- jeton ne peut donc rien lire de la table — la fonction ci-dessous est
-- son unique porte d'entrée.
create policy "invitations visibles par le groupe"
  on public.invites for select
  using (public.is_member());

create policy "un membre invite"
  on public.invites for insert
  with check (public.is_member() and created_by = auth.uid());

create policy "l'auteur révoque son invitation"
  on public.invites for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());


-- ------------------------------------------------------------
--  Consommer un jeton
--
--  security definer : la fonction écrit dans members, ce que la
--  politique interdit à tout le monde. Elle ne le fait qu'après
--  avoir validé le jeton, et pour l'appelant seulement.
-- ------------------------------------------------------------

create function public.redeem_invite(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  me  uuid := auth.uid();
begin
  if me is null then return 'anon'; end if;
  if exists (select 1 from public.members where user_id = me) then return 'already'; end if;

  -- for update : deux amis qui cliquent en même temps ne peuvent pas
  -- dépasser ensemble le nombre d'usages autorisé.
  select * into inv from public.invites where id = token for update;

  if not found or inv.revoked then return 'invalid'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then return 'expired'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then return 'used'; end if;

  insert into public.members (user_id) values (me);
  update public.invites set uses = uses + 1 where id = inv.id;
  return 'ok';
end $$;

-- Appelable par tout compte connecté : c'est justement le cas d'un ami
-- qui vient de s'inscrire et n'est pas encore membre.
revoke execute on function public.redeem_invite(uuid) from public;
grant execute on function public.redeem_invite(uuid) to authenticated;


-- ==========================================================
--  0007_push.sql
-- ==========================================================

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


-- ==========================================================
--  0008_notify_prefs.sql
-- ==========================================================

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
