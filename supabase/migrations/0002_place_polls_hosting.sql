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
