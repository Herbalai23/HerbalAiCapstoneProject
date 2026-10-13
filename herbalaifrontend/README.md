# Herbal-Ai frontend

Start with [the project map and plain-English debugging guide](../ARCHITECTURE.md).

- `src/app`: website addresses, page metadata, root layout and global styles.
- `src/features`: actual screens and feature-specific components/helpers.
- `src/components/core`: navigation, footer, branding, theme and PWA integration.
- `src/components/shared`: reusable dialogs, images and fallback states.
- `src/components/ui`: buttons, inputs, cards, badges and alerts.
- `src/lib`: shared API connection, caching and session context.
- `src/validation`: registration name rules.
- `src/data`: regional plant-name reference data, not live database tables.
- `src/proxy.ts`: protected-page redirects; backend authorization still decides access.
- `public`: public images, favicon and service worker.

Route groups such as `(auth)` organize files without changing URLs or granting access.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## UI components

Reusable controls in `src/components/ui/` follow the shadcn/ui open-code pattern. `components.json` points to `src/app/globals.css`. Keep existing classes and theme tokens when editing controls.

Home, Library, and navigation currently use the shared Button, Input, Badge, and Alert components. Dialogs and account menus still use the existing custom components.

## Image credits

The homepage hero uses a resized [photograph of Mt. Pulag](https://commons.wikimedia.org/wiki/File:Panoramic_Shot_of_Mt._Pulag_Summit_and_Grassland.jpg) by Bien02, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is displayed with a crop and dark overlay for readable text.

To edit the homepage, open `src/features/home/HomeScreen.tsx`. The thin `src/app/(public)/page.tsx` file only connects its URL to that screen.

Fonts remain self-hosted Newsreader, Plus Jakarta Sans and JetBrains Mono.

## Validation

Run `npm run check:architecture`, `npm run lint`, `npm run build` and `npx tsc --noEmit`. Configure local API/socket addresses for testing; do not use production credentials.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
