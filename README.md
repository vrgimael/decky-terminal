# Decky Terminal Focus

A personal fork of [Alex4386/decky-terminal](https://github.com/Alex4386/decky-terminal) for terminal applications in Steam Game Mode, including Codex, editors, and other interactive command-line tools.

This fork captures terminal navigation and editing keys, handles Steam's virtual keyboard, provides a visible fullscreen exit, and releases input when the shell finishes. It uses Steam's internal router rather than assuming the browser URL identifies the current page.

## Install on a Steam Deck

1. Install Decky Loader on the target device if it is not already installed.
2. Copy `decky-terminal-focus-0.5.3-focus.1.zip` to the Steam Deck, for example into Downloads. Use the plugin ZIP from `out/` or the build artifact; GitHub's **Download ZIP** source archive is not an installable plugin.
3. Open Decky settings. Enable **Developer Mode** under **General**, then open **Developer** and choose the option to install a plugin from a ZIP file.
4. Select the plugin ZIP and confirm installation. Open **Decky Terminal Focus** and create a terminal.

The fork has its own plugin name, settings, and route prefix, so it can coexist with the original Decky Terminal. Existing sessions and settings are not migrated. New installs default to Bash when available; otherwise choose a shell in the plugin settings.

Codex itself is a separate installation on each device. This package contains no Codex credentials, shell profiles, account configuration, or personal terminal history. On the Steam Deck, use that device's normal Codex installation and login.

## Controls

- Click the terminal to capture input. Escape, Enter, arrows, and editing keys go to the terminal.
- Use **Ctrl+Shift+F10** or the visible capture control to release input to Steam.
- Tap **Exit fullscreen** to return to the normal layout and release capture.
- While Steam's virtual keyboard is visible, its navigation and dismissal controls remain available. Closing it restores terminal focus if capture was active.
- Running `exit` ends the shell, leaves fullscreen, and displays its exit status. Output stays visible until you leave the page.

## Build from source

Requires Node.js 22, pnpm 9.15.9, and Python 3. No Docker or Decky CLI is needed for this Python-only plugin.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm package
```

The installable ZIP and SHA-256 checksum are written to `out/`. GitHub Actions runs the same build and uploads them as a workflow artifact. Download that artifact, extract it, and install the inner plugin ZIP.

`src/pages/Terminal.jsx` contains the maintained terminal component. It is JavaScript alongside upstream TypeScript, preserving the exact working focus implementation during the initial port.

## Verified initial bundle

`prebuilt/index.js` preserves the working bundle from the original local installation, with only the plugin title and routes namespaced and its stale source-map reference removed. It allows this first version to be packaged without downloading build dependencies:

```sh
node scripts/verify-prebuilt.mjs
node scripts/test.mjs --prebuilt
python3 scripts/package.py --prebuilt
```

The prebuilt checksum and upstream commit are recorded in `prebuilt/PROVENANCE.json`. The source-parity check rejects changes to the terminal component that have not been reflected in the prebuilt version. For subsequent development, build from source and test the resulting `dist/index.js`.

## Verification and compatibility

The component harness covers physical and virtual input forwarding, mismatched browser/internal routes, capture release, duplicate-arrow suppression, virtual-keyboard dismissal, repeated fullscreen toggles, shell exit, navigation away and back, terminal switching, and unmount/late-response cleanup. It exercises the compiled component with simulated Steam and xterm interfaces.

On a machine with Steam installed, two additional integration checks inspect the installed Steam exports. Without Steam those checks report a skip; the component harness still runs. Set `STEAM_UI_PATH` if Steam's `steamui` directory is in a different location.

The original working installation was verified by its user on Bazzite with Decky 3.3.0. The renamed package and each new Steam build still require on-device checking. Steam's internal keyboard and router interfaces can change, so automated checks do not replace a Game Mode test.

## Upstream and license

Based on upstream commit `c520a6a8e734aaa26088ef2cc75ca5cfb2660d46` (version 0.5.3). Upstream copyright notices and the BSD-3-Clause license are retained; the MIT notice in `src/common/xterm_css.tsx` is also retained. The prebuilt bundle includes upstream's bundled dependencies.

To keep upstream changes separate:

```sh
git remote add upstream https://github.com/Alex4386/decky-terminal.git
git fetch upstream
```
