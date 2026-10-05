-- ============================================================
--  HUB Events — le wifi en deux champs
--
--  Le nom de la box d'un côté, le mot de passe de l'autre :
--  on copie le second sans avoir à le détacher du premier.
-- ============================================================

alter table public.places rename column wifi to wifi_password;
alter table public.places add column wifi_name text;
