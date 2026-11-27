# vue-kit

Codice condiviso dai frontend Vue di vitalegi: pathfinder, spesucce, mangar e i prossimi.
Lo stack comune e le assunzioni generali sono in [`docs/frontend-stack.md`](docs/frontend-stack.md).

## Pacchetti

| Pacchetto                                         | Cosa contiene                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`@vitalegi/api-client`](packages/api-client)     | Wrapper su `fetch`: autenticazione, un solo refresh per più 401 contemporanei, sessione scaduta, `ApiError` |
| [`@vitalegi/auth-cognito`](packages/auth-cognito) | Login PKCE sulla Hosted UI di Cognito: store Pinia, guard del router, client API autenticato                |

In programma (vedi `docs/frontend-stack.md`, §5): `@vitalegi/ui-theme`, `@vitalegi/eslint-config`, `@vitalegi/tsconfig`.

## Usare i pacchetti in un'app

I pacchetti sono pubblicati su **GitHub Packages**. Nell'app:

1. Aggiungi un file `.npmrc` (versionato, senza segreti):

   ```
   @vitalegi:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
   ```

2. Imposta la variabile `GITHUB_PACKAGES_TOKEN` sul PC di build e nella CI. Serve un token GitHub _classic_ con lo scope `read:packages`: i token fine-grained non funzionano con il registry npm di GitHub Packages.

3. Installa: `pnpm add @vitalegi/auth-cognito`.

La build dell'immagine Docker sul Raspberry usa la `dist/` già compilata sul PC, quindi lì non serve nessun token.

I pacchetti sono ESM, distribuiti come JavaScript compilato con i tipi (`.d.ts`), pensati per app compilate con Vite.

## Sviluppo

Requisiti: Node 22.18+ o 24.12+, pnpm (versione in `packageManager`).

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` esegue formattazione, lint (oxlint + ESLint), type-check, test (Vitest) e build. Gli altri comandi:

| Comando          |                                     |
| ---------------- | ----------------------------------- |
| `pnpm test`      | test di tutti i pacchetti           |
| `pnpm build`     | compila `packages/*/dist`           |
| `pnpm format`    | Prettier                            |
| `pnpm changeset` | descrive una modifica da rilasciare |

Per provare una modifica in un'app senza pubblicarla:

```bash
pnpm build
```

```bash
cd ../pathfinder/pathfinder-fe && pnpm link ../../vue-kit/packages/auth-cognito
```

## Rilasci

1. Ogni modifica a un pacchetto da rilasciare include un changeset (`pnpm changeset`: tipo patch/minor/major e una riga di descrizione).
2. Al merge su `main`, la workflow **Release** apre o aggiorna la PR "Version Packages", con versioni e CHANGELOG aggiornati.
3. Quando quella PR viene unita, la workflow pubblica su GitHub Packages le versioni nuove.

Le app fissano la versione e aggiornano quando vogliono.
