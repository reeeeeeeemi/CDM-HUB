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
