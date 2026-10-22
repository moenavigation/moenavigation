# MOE Navigation demo

A responsive maritime corporate website built with Next.js App Router,
TypeScript, CSS Modules and Lucide icons. The demo follows the desktop and
mobile references in `Design/`, with Thai and English content and generated
maritime photography.

## Run locally

```sh
npm install
npm run dev
```

Open [http://localhost:3005](http://localhost:3005). Thai pages use `/`, English
pages use `/en`, and the browser-based CMS demo is at `/cms`.

For the production build locally:

```sh
npm run build
npm run start
```

Both servers use port **3005**. Stop the development server before starting
the production server on that port. On PowerShell, use `npm.cmd` if the `npm`
script shim is blocked.

## Validate

```sh
npm run typecheck
npm run lint
npm run build
npm run start
```

With the server running, use a second terminal:

```sh
npm run test:smoke
```

The smoke script also accepts a server URL:
`npm run test:smoke -- http://localhost:3005`.

## Demo boundaries

CMS edits and enquiry drafts stay in the current browser. There is no real
authentication, contact-email delivery, database, external API or cloud-media
connection. Photography and business examples are illustrative; vessel
specifications and route availability require confirmation. The demo is
marked **noindex, nofollow**.

The Routes page uses an interactive geographic map. Map tiles need an
internet connection; its plotted connections are approximate demo
illustrations and must not be used for navigation.

See [docs/DEMO.md](docs/DEMO.md) for the publication workflow, integration
points, image manifests and verification record. Project guidance remains
in `AGENTS.md` and the other documents in `docs/`.
