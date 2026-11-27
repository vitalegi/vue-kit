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

I pacchetti sono pubblicati su **npmjs.com**, pubblici: si installano come qualunque altro pacchetto, senza token né `.npmrc`.

```bash
pnpm add @vitalegi/auth-cognito
```

Ogni versione è pubblicata con la _provenance_ di npm: sulla pagina del pacchetto si vede il commit e la workflow che l'hanno prodotta.

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
3. Quando quella PR viene unita, la workflow pubblica su npmjs.com le versioni nuove, con un tag git e una GitHub Release per ciascuna.

La pubblicazione usa il secret `NPM_TOKEN` del repository: un token npm _Granular_ con permesso di lettura e scrittura sui pacchetti dello scope `@vitalegi`.

Le app fissano la versione e aggiornano quando vogliono.
