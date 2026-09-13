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
