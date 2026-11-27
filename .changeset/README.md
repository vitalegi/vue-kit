# Changesets

Ogni modifica a un pacchetto che va rilasciata richiede un changeset: `pnpm changeset`, poi si sceglie il tipo
(patch / minor / major) e si scrive una riga di descrizione. Al merge su `main` la CI apre la PR "Version Packages";
quando viene unita, i pacchetti vengono pubblicati su npmjs.com.
