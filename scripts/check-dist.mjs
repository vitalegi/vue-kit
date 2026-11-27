// Importa la dist compilata con Node puro: verifica che i pacchetti pubblicati siano ESM validi
// (es. import relativi con estensione), come li caricano Vitest e Node nelle app.
const packages = ['@vitalegi/api-client', '@vitalegi/auth-cognito']
const roots = { '@vitalegi/api-client': 'api-client', '@vitalegi/auth-cognito': 'auth-cognito' }
let failed = false
for (const name of packages) {
  const url = new URL(`../packages/${roots[name]}/dist/index.js`, import.meta.url)
  try {
    const mod = await import(url.href)
    console.log(`${name}: ok (${Object.keys(mod).length} export)`)
  } catch (error) {
    failed = true
    console.error(`${name}: ${error.message}`)
  }
}
process.exit(failed ? 1 : 0)
