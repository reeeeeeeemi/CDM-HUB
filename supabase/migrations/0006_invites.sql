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
