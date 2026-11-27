# Stack frontend comune

> Stato: **proposta** (2026-11-27), da validare con il pilota su `pathfinder-fe`.
> Vale per tutti i frontend personali: `pathfinder-fe`, `spesucce-fe`, `mangar-fe` e i prossimi.
> Documento di riferimento: vive in `vitalegi/vue-kit` (`docs/frontend-stack.md`); i `CLAUDE.md` dei progetti puntano qui.

## 1. Situazione di partenza

|            | pathfinder-fe                      | spesucce-fe                                                                                                   | mangar-fe                                      |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| UI         | PrimeVue 5, uso leggero (~10 file) | PrimeVue 5, uso intenso (DataTable, DatePicker, InputNumber, Select/MultiSelect, Toast, Confirm, Tabs, Chart) | Quasar 2 (Table, Form, Dialog, Uploader, Card) |
| Build      | Vite, pnpm                         | Vite, pnpm                                                                                                    | Quasar CLI, yarn                               |
| TypeScript | ~6.0                               | ~6.0                                                                                                          | ~5.9                                           |
| HTTP       | `fetch` + `apiClient.ts`           | `fetch` + `apiClient.ts`                                                                                      | axios                                          |
| Auth       | Cognito PKCE (`stores/auth.ts`)    | Cognito PKCE (`stores/auth.ts`, quasi identico)                                                               | propria (`src/auth`)                           |

`apiClient.ts` e `stores/auth.ts` di pathfinder e spesucce sono quasi copie (circa 450 righe duplicate).
Ogni correzione va fatta due volte, e diventeranno tre con mangar sul SSO.

## 2. Assunzioni generali

- **Utenti e uso**: pochi utenti (famiglia e amici). Uso **prevalente da iPhone** (riferimento iPhone 15 Pro), installata come PWA. Il desktop va supportato ma non è prioritario.
- **Lingua**: interfaccia solo in italiano, locale `it-IT` per date e numeri. Niente libreria di i18n finché non serve una seconda lingua.
- **Un solo sviluppatore**: conta più la manutenzione nel tempo che la velocità del primo sviluppo. Le stesse scelte valgono ovunque, così passare da un progetto all'altro non costa.
- **Dipendenze**:
  - poche, ben mantenute, con licenza **MIT o Apache-2.0**;
  - niente librerie che richiedono una chiave di licenza (motivo per cui si lascia PrimeVue 5);
  - una nuova dipendenza si aggiunge solo dopo averne parlato (regola già in vigore in spesucce).
- **Backend**: ogni frontend chiama solo il proprio backend su `/api`, lo stesso path in dev (proxy Vite) e in prod (Caddy/nginx). Niente chiamate dirette a servizi terzi dal browser.
- **Sicurezza**: CSP restrittiva. Nessuna risorsa da CDN esterni (font, icone, script), tutto incluso nella build.
- **Deploy**: build sul PC, statici serviti da nginx unprivileged sul Raspberry dietro Cloudflare Tunnel, deploy manuale. L'header CSP va scritto su una sola riga.
- **Offline**: nessun service worker che fa cache di default. La cache è lasciata al browser; un eventuale worker esiste solo come kill switch.

## 3. Lo stack

| Livello                  | Scelta                                                                | Note                                                                                           |
| ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Framework                | **Vue 3** (Composition API, `<script setup>`) + **TypeScript** strict |                                                                                                |
| Build                    | **Vite**                                                              | mangar lascia la Quasar CLI                                                                    |
| Package manager          | **pnpm**                                                              | stessa versione di Node in tutti i progetti (`engines`)                                        |
| Stato                    | **Pinia**                                                             |                                                                                                |
| Routing                  | **Vue Router**                                                        | guard di autenticazione comune (§5)                                                            |
| Componenti UI            | **Nuxt UI v4** in modalità Vue (plugin Vite, senza Nuxt)              | MIT, ~125 componenti, base Reka UI (accessibilità)                                             |
| Stili                    | **Tailwind CSS v4**                                                   | tema con variabili CSS; gli stili `scoped` esistenti restano finché non si migra il componente |
| Icone                    | **Lucide** tramite Iconify, **incluse nella build**                   | nessuna chiamata all'API Iconify a runtime (CSP), da verificare nel pilota                     |
| Date                     | `Intl` + `@internationalized/date`                                    | quest'ultima la richiedono i componenti calendario di Nuxt UI                                  |
| Grafici                  | **Chart.js** con **vue-chartjs**                                      | spesucce usa già Chart.js, cambia solo il wrapper                                              |
| HTTP                     | `fetch` + client condiviso (§5)                                       | niente axios                                                                                   |
| Test unitari             | **Vitest** + `@vue/test-utils` + jsdom                                | struttura `given / when / then` (§4)                                                           |
| Test end-to-end / visivi | **Playwright**                                                        | screenshot su iPhone 15 Pro e desktop per le modifiche di UI                                   |
| Qualità                  | **ESLint** (flat config) + **oxlint** + **Prettier** + `vue-tsc`      | configurazione condivisa (§5)                                                                  |
| PWA                      | `manifest.webmanifest` scritto a mano                                 | nessun plugin PWA                                                                              |
| Container                | `nginx/nginx-unprivileged` (alpine)                                   | `read_only`, `cap_drop: ALL`, come le altre convenzioni degli stack                            |

### Componenti Nuxt UI che sostituiscono quelli attuali

| Bisogno                     | PrimeVue / Quasar oggi            | Nuxt UI                                                       |
| --------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Tabelle                     | DataTable, q-table                | `UTable` (TanStack Table)                                     |
| Date                        | DatePicker                        | `UCalendar`, `UInputDate`                                     |
| Numeri                      | InputNumber                       | `UInputNumber`                                                |
| Selezione                   | Select, MultiSelect, SelectButton | `USelect`, `USelectMenu` (multiplo), `UTabs` o `UButtonGroup` |
| Notifiche                   | Toast                             | `useToast` + `UToast`                                         |
| Conferme e dialoghi         | ConfirmDialog, Dialog, q-dialog   | `UModal`                                                      |
| Pannello dal basso (mobile) | Drawer                            | `UDrawer` (vaul, con swipe)                                   |
| Menu                        | Menu, Menubar                     | `UDropdownMenu`, `UNavigationMenu`                            |
| Upload                      | q-uploader                        | `UFileUpload`                                                 |
| Tab                         | Tabs                              | `UTabs`                                                       |

## 4. Convenzioni di sviluppo

- **Struttura di `src/`**: `views/`, `components/`, `composables/`, `stores/`, `router/`, `types/`, `utils/`, `api/` (chiamate al backend, una funzione per endpoint). Test in `__tests__/` accanto al codice.
- **Test**: TDD dove possibile. Blocchi `describe('given …')` / `describe('when …')` / `it('then …')`. Almeno un'asserzione per test, che verifichi un comportamento del codice e non i dati dei mock.
- **Mobile first**: elementi toccabili di almeno 44 px, `env(safe-area-inset-*)` per notch e home indicator, `viewport-fit=cover`.
- **Accessibilità**: veri `<button>`/`<a>`, `aria-label` sui pulsanti con sola icona, contrasto AA.
- **Documentazione**: ogni funzionalità è descritta in `docs/` nello stesso commit. `CLAUDE.md` contiene il contesto per le sessioni di Claude.
- **Dipendenze**: aggiornamenti periodici con lo script `bump-deps` di spesucce (patch e minor dopo i controlli della CI, le major solo segnalate), da portare negli altri progetti.

## 5. Codice condiviso: repository `vitalegi/vue-kit`

### Dove

Nome scelto: `vue-kit` (non `web-kit`, che si confonde con WebKit, il motore di Safari). I pacchetti restano sotto lo scope `@vitalegi/`.

Un **repository dedicato**, `vitalegi/vue-kit`, organizzato come workspace pnpm con più pacchetti piccoli. Le alternative scartate:

| Opzione                                          | Perché no                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Dentro uno dei progetti (es. pathfinder)         | Le altre app dipenderebbero dal ciclo di rilascio di un'app che non c'entra      |
| Git submodule                                    | Fragile da aggiornare e facile da dimenticare in uno stato incoerente            |
| Copia del codice in ogni progetto (stile shadcn) | È proprio la duplicazione che si vuole eliminare                                 |
| Monorepo con tutti i frontend                    | I progetti hanno backend, CI e deploy separati: unirli costa più di quanto rende |

### Contenuto

| Pacchetto                 | Contenuto                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vitalegi/api-client`    | Wrapper su `fetch`: header, base `/api`, errori tipizzati, un solo refresh condiviso tra più 401 contemporanei, retry dopo il refresh, aggancio per la sessione scaduta                |
| `@vitalegi/auth-cognito`  | Login PKCE sulla Hosted UI, callback, refresh con cookie httpOnly, logout anche dalla Hosted UI, store Pinia e guard del router; configurazione per app (dominio, client id, redirect) |
| `@vitalegi/ui-theme`      | Preset Nuxt UI (colori, raggi, font) e CSS di base: stesso aspetto in tutte le app                                                                                                     |
| `@vitalegi/eslint-config` | ESLint flat config + oxlint + Prettier                                                                                                                                                 |
| `@vitalegi/tsconfig`      | `tsconfig` di base                                                                                                                                                                     |

Non va nel kit:

- codice di dominio (media, spese, manga);
- componenti specifici di una sola app;
- variabili d'ambiente.

Un pezzo entra nel kit quando serve ad almeno due app.

### Distribuzione e versioni

- **Pubblicazione**: su **npmjs.com**, pacchetti pubblici sotto lo scope `@vitalegi` (non contengono segreti: domini e client id stanno nelle variabili delle app). Si installano senza token né `.npmrc`, sul PC, in CI e nelle sessioni cloud. Ogni versione ha la provenance di npm. [superato] GitHub Packages: richiedeva un token anche per installare.
- **Versioni**: semver, una per pacchetto, gestite con **Changesets**. Ogni app fissa la versione e aggiorna quando vuole.
- **Test**: nel kit, con la stessa disciplina delle app. Le app non ritestano il kit, ma solo come lo usano.
- **Sviluppo in parallelo**: kit e app insieme con `pnpm link`, senza pubblicare.

## 6. Piano di migrazione

| Fase | Cosa                                                                                                                                                                                                                                                                                      | Perché in quest'ordine                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | **Pilota su pathfinder-fe**: Nuxt UI + Tailwind al posto di PrimeVue (Button, Checkbox, SelectButton, Menu, Drawer, Accordion). _Stato (2026-11-27): fatto, con `api-client` e `auth-cognito` adottati; manca solo il lockfile, da rigenerare dopo la pubblicazione dei pacchetti su npm_ | È il più piccolo, valida le assunzioni aperte e toglie il banner della licenza |
| 2    | **Creazione di `vue-kit`** con `api-client` e `auth-cognito` estratti da pathfinder e spesucce. _Stato: pacchetti 0.1.0 pronti e testati, non ancora pubblicati né adottati dalle app_                                                                                                    | Il codice c'è già ed è quasi identico                                          |
| 3    | **spesucce-fe** su Nuxt UI e vue-kit                                                                                                                                                                                                                                                      | È il più ricco di componenti: è il vero banco di prova della libreria          |
| 4    | **mangar-fe**: da Quasar CLI a Vite, Nuxt UI, vue-kit e SSO Cognito                                                                                                                                                                                                                       | È il lavoro più grande (build e auth insieme)                                  |
| 5    | **Nuovi progetti** partono da un template `vitalegi/web-template` (Vite + stack + vue-kit già configurati)                                                                                                                                                                                |                                                                                |

## 7. Punti aperti da verificare nel pilota

Esito del pilota su pathfinder-fe (2026-11-27):

- [x] **Icone Lucide incluse nella build**, senza chiamate all'API Iconify: `@iconify-json/lucide` + opzione `icon: { clientBundle: { scan: true } }` del plugin Vite. Verificato servendo la build di produzione con il CSP di `nginx.conf`: nessuna violazione e nessuna richiesta esterna. Il CSP non cambia.
- [x] **Tailwind v4 con gli stili `scoped`**: nessuna regressione visiva (screenshot Playwright prima e dopo, iPhone 15 Pro e desktop), con quattro accorgimenti da ripetere nelle altre app:
  - gli stili globali (reset, `body`, `a`...) vanno nel layer `base` (`@import './base.css' layer(base)`): fuori dai layer sovrascrivono le utility dei componenti Nuxt UI (es. `* { font-weight: normal }` annullava `font-medium`);
  - il preflight di Tailwind azzera la dimensione dei titoli: vanno ripristinati quelli usati senza classi;
  - `#app` deve avere `class="isolate"`, altrimenti drawer e menu (in fondo al body, `z-index: auto`) finiscono sotto gli elementi sticky;
  - la variante `outline` di Nuxt UI ha lo sfondo bianco: sui fondi scuri (viewer) serve uno stile scoped trasparente.
- [x] **Peso del bundle**: JS da 518 a 781 KB (gzip da 130 a 252 KB), CSS da 23 a 221 KB (gzip da 7 a 30 KB). La `dist` complessiva scende da 1,22 a 1,05 MB perché spariscono i font di primeicons. Circa +145 KB gzip: accettabile per un'app installata, ma da tenere d'occhio. Il CSS cresce perché Tailwind genera le classi di tutti i componenti Nuxt UI, non solo di quelli usati.
- [x] **`UDrawer` su iPhone**: swipe verso l'alto per chiudere verificato (eventi touch in emulazione iPhone 15 Pro), scroll interno con `max-h-[80vh]` sul contenuto. Il drawer non ha un pulsante di chiusura: aggiunto nell'header per il desktop. Safe area: aggiunto `pt-[env(safe-area-inset-top)]` (il drawer parte dall'alto), da verificare sul telefono reale nella PWA installata, perché l'emulazione non simula il notch.
- [x] **Vitest nelle app con i pacchetti `@vitalegi`**: emerso nel pilota (la `dist` aveva import interni senza estensione). Corretto nel kit prima della pubblicazione su npm: import `.js`, `NodeNext` e controllo `pnpm check:dist`. Il workaround `test.server.deps.inline` in pathfinder-fe si può togliere dopo l'installazione da npm.
- [ ] Tema scuro: il viewer di pathfinder è scuro, il resto dell'app no; decidere se supportare `prefers-color-scheme`.
- [x] Dove pubblicare il kit: npm pubblico (deciso il 2026-11-27).

## 8. Rischi

- **Nuxt UI dipende da un'azienda** (NuxtLabs): è lo stesso tipo di rischio che ha portato via da PrimeVue.
  - Attenuanti: licenza MIT (le versioni rilasciate restano libere) e base Reka UI. In caso di cambio di condizioni si passa a shadcn-vue, che usa le stesse primitive e lo stesso Tailwind, senza riscrivere le app.
- **Tailwind**: è un modo nuovo di scrivere stili nei progetti. Si introduce gradualmente, componente per componente.
- **Un kit condiviso** aggiunge un passaggio a ogni modifica comune (pubblicare, poi aggiornare le app).
  - Attenuanti: pacchetti piccoli, versioni fissate e `pnpm link` durante lo sviluppo.
