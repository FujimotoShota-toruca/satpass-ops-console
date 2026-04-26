# Troubleshooting

## Vite build fails inside satellite.js wasm-build / pthreads-release

If `npm run build` fails with an error similar to:

```text
Top-level await is currently not supported with the iife output format
node_modules/satellite.js/wasm-build/pthreads-release/index.js
```

then a newer `satellite.js` release was installed via `latest`. This project intentionally pins `satellite.js` to `5.0.0` for the browser-only Vite build.

Run from the project root:

```powershell
rmdir /s /q node_modules
del package-lock.json
npm install
npm run build
```

If `package-lock.json` does not exist, the `del` command may show an error; that is harmless.
