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
