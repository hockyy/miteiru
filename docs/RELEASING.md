# Releasing Miteiru

Installers are built by the manual **Release** workflow (`.github/workflows/release.yml`):

```bash
gh workflow run release.yml -f tag=v8.0.1 -f platform=all -f publish=true
```

- It builds NSIS (Windows), DMG (macOS) and deb plus AppImage (Linux).
- It smoke-tests the packaged macOS and Linux apps.
- It uploads everything to the release named by `tag`, creating the release if it's missing. The release notes come from `docs/whats-new/<version>.md`.
- `-f publish=false` keeps the installers as workflow artifacts instead.
- `-f platform=windows` (or `macos`, `linux`) rebuilds one platform.

The version comes from `package.json`, so bump it before tagging.

## In-app updates

Installed copies check `https://github.com/hockyy/miteiru/releases/latest/download/latest.json`, a few seconds after starting. That is `plugins.updater` in `src-tauri/tauri.conf.json`.

`latest.json` lists, for each platform, the update file and its signature:

| Platform | Update file |
| --- | --- |
| Windows | the NSIS installer |
| macOS | `Miteiru_<version>_aarch64.app.tar.gz` |
| Linux | the AppImage |

The Release workflow's last job writes `latest.json` from the `.sig` files the build jobs uploaded (`scripts/makeUpdaterManifest.mjs`).

The app installs an update only if its signature matches the public key built into it, and only if the signature was made for the version `latest.json` announces (`requireSignedVersion`). A tampered `latest.json` can't push an old release, and nobody without the private key can push a file.

### One-time setup: the signing key

Until this is done, release builds don't check for updates (the public key in `tauri.conf.json` is empty), and releases ship without update files.

1. Make the key pair. Keep the private key and its password somewhere safe, such as a password manager. **If they are lost, installed copies can never be updated again**; users would have to reinstall by hand.
   ```bash
   npx tauri signer generate -w ~/.tauri/miteiru.key
   ```
2. Give the Release workflow the private key and its password:
   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/miteiru.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```
3. Put the public key in the app. Copy the contents of `~/.tauri/miteiru.key.pub` into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` and merge that. The public key isn't secret.

From the next release on, the workflow signs the update files and publishes `latest.json`. Copies built from that point on update themselves.

The workflow stops with an error if the private key is set but `pubkey` is still empty. If the private key isn't set, it warns and builds the release without update files.

### Which installs update

- Windows (NSIS, passive install), macOS (the app bundle is replaced) and the Linux AppImage update themselves.
- The `.deb` doesn't; users install the new `.deb`.
- Development and debug builds never check.
- The smoke test (`MITEIRU_SMOKE_TEST`) doesn't check either.

## Testing an update locally

Sign a dummy file with a throwaway key, serve a `latest.json` from localhost, and build the app pointed at it. The override is only for the test build: an `http` endpoint needs `dangerousInsecureTransportProtocol`.

```bash
npx tauri signer generate -w /tmp/test.key -p test --ci
npx tauri signer sign -f /tmp/test.key -p test --app-version 8.0.1 Miteiru_8.0.1_x64-setup.exe
```

Then build with `TAURI_CONFIG` setting `plugins.updater.pubkey` to `/tmp/test.key.pub`, the endpoint to the local server, and `dangerousInsecureTransportProtocol: true`.
