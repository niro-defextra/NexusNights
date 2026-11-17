# NEXUSNIGHT TV

Standalone Samsung Tizen TV web application for the existing NEXUSNIGHT service.

## Target device

- Primary test device: Samsung UA55RU7300SXEG (RU7300, 2019)
- Runtime target: Tizen 5.0 / Chromium M63
- Tizen SDK used to build: SDK 10.0 in the current development environment
- App ID: `7P7lQLyuKP.NexusNightsTv` (preserved from the generated project)

The SDK version on the PC does not upgrade the TV firmware. `required_version` and Samsung `devel.api.version` are configured separately in `config.xml`.

## What is implemented

- TV-first home, movies, series, details, search, sports-channel list, and settings screens.
- Directional remote navigation and focus management.
- API client aligned with the existing server routes under `/api`.
- Local-library metadata and playback fallback.
- Samsung AVPlay adapter for direct HLS/DASH sources, and HTML5 video for supported MP4/HLS sources.
- Provider alternatives and playback error handling.
- Arabic-first interface and Arabic/English search keyboard.

External provider pages (`embed`) are not treated as direct streams. On a Samsung TV the player skips embed sources and tries the next alternative; direct HLS/MP4 sources are required for dependable remote-controlled playback. Browser preview may display an embed, but that is not a claim that it works on the TV.

Sports channel keys are read from the server's `/api/sports/status` route. Their presence does not guarantee an active or playable stream; playback is checked only when a channel is opened.

## Backend

Default backend: `https://nexusunights.tech` (preserved from the supplied project).

To change it, edit `apiBaseUrl` in `js/config.js` before packaging, or set the TV app's localStorage key `nexus_backend_url`. The TV must be able to reach the backend over the network. Do not use `localhost` for a backend running on the PC.

See [BACKEND_SETUP.md](BACKEND_SETUP.md) for the API contract used by this client.

## Build and install on Windows

Requirements: Tizen Web CLI, Samsung TV Extension, an existing Samsung certificate profile, and an SDB-connected TV.

Open PowerShell in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\build.ps1
```

The script asks for the exact certificate profile name, runs `tizen build-web`, signs a WGT, and copies it to the repository's `dist/NexusNightTV.wgt`.

To build and install on the connected TV in one run:

```powershell
.\build.ps1 -Install
```

The default SDB serial is the connected device previously reported as `192.168.1.3:26101`. If the TV's address changes, pass the new serial explicitly:

```powershell
.\build.ps1 -Install -DeviceSerial "192.168.1.3:26101"
```

You can pass the certificate profile name without the prompt:

```powershell
.\build.ps1 -CertificateProfile "YOUR_EXACT_PROFILE_NAME" -Install
```

The final signed package is copied to `../dist/NexusNightTV.wgt`. The signing key and profile are not included in this source archive.

## Source layout

- `config.xml` — Samsung TV application manifest
- `js/api.js` — existing backend API client
- `js/focus.js` — remote navigation and focus manager
- `js/player.js` — AVPlay / HTML5 playback adapter
- `js/pages/` — TV screens
- `css/` — TV visual system and components
- `build.ps1` — build, signing, and optional device installation

## Important verification note

JavaScript syntax, XML, YAML, and local browser smoke checks can be performed on a PC. Actual package signing, installation, AVPlay codec behavior, provider compatibility, and playback must still be tested on the connected Samsung UA55RU7300SXEG with the user's own Tizen CLI and certificate profile.

## Source bundle contents

The delivered source bundle intentionally omits generated `node_modules`, compiled `dist` folders, Tizen build metadata/cache, local browser-profile sessions, and transient HLS/room cache files. These are environment-specific or runtime-generated data, not required source files. Install dependencies from each folder's `package.json` when preparing the web/server project. No signing certificates or private keys are included.
