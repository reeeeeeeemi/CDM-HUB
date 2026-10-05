-- ============================================================
--  HUB Events — le jour du trajet
--
--  Sur un big event de plusieurs jours, une heure seule ne dit
--  pas quand on part ni quand on arrive. Le jour s'ajoute à
--  côté, facultatif comme l'heure.
-- ============================================================

alter table public.event_transport add column at_date date;
