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
