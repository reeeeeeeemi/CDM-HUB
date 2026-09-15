# Déployer le hub pour un autre groupe

Le même dépôt sert plusieurs bandes d'amis. Chaque groupe a **sa base
Supabase** et **son projet Vercel** ; le code, lui, reste unique — un
`git push` déploie tous les groupes à la fois.

Compter une demi-heure.

---

## 1. La base — Supabase

1. [supabase.com](https://supabase.com) → **New project**
2. Nom du projet, **mot de passe de la base** (garde-le), région **Europe West**
3. Attendre la fin de la création, une à deux minutes
4. **SQL Editor** → **New query** → coller tout `supabase/install.sql` → **Run**
5. **Authentication → Sign In / Providers → Email** → décocher **Confirm email**
   *(sinon Supabase limite les inscriptions à quelques emails par heure)*
6. **Project Settings → API** → relever :
   - **Project URL**
   - la clé **publishable** (`sb_publishable_…`)

> Le plan gratuit limite le nombre de projets actifs par organisation, et met
> en pause un projet inactif 7 jours. Un groupe peu actif se rendormira : le
> bouton **Restore** du dashboard le réveille, sans perte de données.

---

## 2. Les clés de notification

Dans un terminal, n'importe où :

```bash
npx web-push generate-vapid-keys
```

Garde les deux valeurs : **chaque groupe a sa propre paire**.

---

## 3. Le déploiement — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project**
2. Importer le **même dépôt GitHub** que le hub existant
3. Donner un nom distinct au projet, par exemple `hub-lesautres`
4. Déplier **Environment Variables** et saisir celles du tableau ci-dessous
5. **Deploy**

### Variables

| Variable | Valeur | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL du nouveau Supabase | config |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publishable | config |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | clé publique VAPID | config |
| `VAPID_PRIVATE_KEY` | clé privée VAPID | **secret** |
| `VAPID_SUBJECT` | `mailto:ton@email.com` | config |
| `NEXT_PUBLIC_GROUP_NAME` | le nom du groupe | config |
| `NEXT_PUBLIC_TAGLINE` | la phrase de l'écran de connexion | config |
| `NEXT_PUBLIC_CITIES` | `Lyon:🦁,Paris:🗼` | config |

Cocher **Production**, **Preview** et **Development** pour chacune.

Seules les cinq premières sont obligatoires. L'identité du groupe a des
valeurs par défaut — sans elle, la nouvelle app s'appellerait « CDM ».

---

## 4. Le premier membre

`members` n'accepte aucune insertion : c'est ce qui garde le hub privé. Le
tout premier ne peut donc pas s'inviter lui-même.

1. Ouvrir la nouvelle app et **créer son compte**
2. Dans le SQL Editor du nouveau projet :

```sql
insert into public.members (user_id)
select id from auth.users where email = 'ton@email.com'
on conflict (user_id) do nothing;
```

3. Recharger la page — le hub s'ouvre

Ensuite, tout le monde entre par un **lien d'invitation**, depuis le menu en
haut à droite.

---

## À retenir ensuite

Toute nouvelle migration SQL est à passer **dans chaque base**. C'est le seul
prix de cette organisation ; le code, lui, ne se maintient qu'une fois.
