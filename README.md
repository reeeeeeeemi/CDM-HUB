# CDM-HUB

Creation of a web app to gather all friend's group information.

Built with [Next.js](https://nextjs.org) (App Router), React 19, TypeScript and Tailwind CSS v4.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Plusieurs groupes

Une seule appli et une seule base servent tous les groupes. Chaque groupe a sa
ligne dans `groups` ; ses events, lieux et invitations portent son `group_id`,
et les politiques RLS empêchent un groupe de voir ce qui appartient à un autre.
Le groupe ouvert est retenu dans le cookie `hub_group`, revérifié à chaque
requête (`readViewer` dans `app/hub.tsx`).

Les catégories proposées viennent du catalogue `lib/catalog.ts` : chaque groupe
en choisit de 3 à 10, « Autre » en plus.

## Base de données

- `supabase/migrations/` — la source du schéma. Toute évolution est une
  nouvelle migration, appliquée à la main (SQL Editor ou MCP Supabase) : la
  base de prod n'a pas d'historique de migrations, `supabase db push` y
  rejouerait tout depuis le début.
- `supabase/install.sql` — les migrations concaténées, pour une base neuve
  (pré-prod, développement). À régénérer après chaque migration :

  ```bash
  for f in supabase/migrations/*.sql; do printf '\n\n-- %s\n\n' "$(basename $f)"; cat "$f"; done > supabase/install.sql
  ```

- `supabase/tests/isolation.sql` — vérifie qu'aucun groupe ne voit ni ne
  touche ce qui appartient à un autre. Tout se passe dans une transaction
  annulée : il se lance sans risque sur la pré-prod comme sur la prod, et
  s'arrête à la première fuite en la nommant.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy on Vercel

The easiest way to deploy this app is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
