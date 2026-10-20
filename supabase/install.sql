-- ============================================================
--  HUB Events — schéma complet, pour une base NEUVE
--
--  Toutes les migrations dans l'ordre, concaténées. À coller en
--  une fois dans le SQL Editor d'un projet Supabase vide — une
--  pré-prod, ou une base de développement.
--
--  Ne pas lancer sur une base existante : plusieurs `create
--  table` échoueraient, et rien ne serait appliqué.
--
--  Généré depuis supabase/migrations/ — la source reste ces
--  fichiers, c'est là qu'il faut ajouter toute suite. Pour le
--  régénérer :
--      for f in supabase/migrations/*.sql; do ...; done
--  (voir README, « Base de données »)
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


-- ==========================================================
--  0009_event_preview.sql
-- ==========================================================

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


-- ==========================================================
--  0010_notify_more.sql
-- ==========================================================

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


-- ==========================================================
--  0011_nudge.sql
-- ==========================================================

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


-- ==========================================================
--  0012_transport_date.sql
-- ==========================================================

-- ============================================================
--  HUB Events — le jour du trajet
--
--  Sur un big event de plusieurs jours, une heure seule ne dit
--  pas quand on part ni quand on arrive. Le jour s'ajoute à
--  côté, facultatif comme l'heure.
-- ============================================================

alter table public.event_transport add column at_date date;


-- ==========================================================
--  0013_birthdays_places.sql
-- ==========================================================

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


-- ==========================================================
--  0014_place_wifi_city.sql
-- ==========================================================

-- ============================================================
--  HUB Events — le wifi et la ville des lieux
--
--  · le wifi : un champ libre, réseau et mot de passe comme on
--    les dicterait (« Livebox-12AB / motdepasse »)
--  · la ville : le carnet se filtre par ville, comme les events
-- ============================================================

alter table public.places
  add column wifi text,
  add column city text;

create index places_city_idx on public.places (city);


-- ==========================================================
--  0015_place_wifi_split.sql
-- ==========================================================

-- ============================================================
--  HUB Events — le wifi en deux champs
--
--  Le nom de la box d'un côté, le mot de passe de l'autre :
--  on copie le second sans avoir à le détacher du premier.
-- ============================================================

alter table public.places rename column wifi to wifi_password;
alter table public.places add column wifi_name text;


-- ==========================================================
--  0016_groups.sql
-- ==========================================================

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


-- ==========================================================
--  0017_chat.sql
-- ==========================================================

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
