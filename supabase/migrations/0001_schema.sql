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
