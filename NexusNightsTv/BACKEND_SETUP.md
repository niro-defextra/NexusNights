# NEXUSNIGHT TV Backend Integration

The TV client uses the existing Node.js backend and its `/api` router. This document reflects routes found in the supplied server source, not a proposed API.

## Backend URL

Default: `https://nexusunights.tech` in `js/config.js`. Configure a different address before packaging by changing `NexusConfig.apiBaseUrl`. The application also reads the `nexus_backend_url` localStorage key.

Never use `localhost` for a backend running on the PC; from the television, localhost points to the television itself.

## Routes used by the TV client

| Purpose | Existing route |
|---|---|
| Health check | `GET /api/health` |
| Home/discovery | `GET /api/discovery/home?lang=ar` |
| Movie details | `GET /api/discovery/movie/:tmdbId?lang=ar` |
| Series details | `GET /api/discovery/tv/:tmdbId?lang=ar` |
| Season details | `GET /api/discovery/tv/:tmdbId/season/:seasonNumber?lang=ar` |
| Search | `GET /api/search?q=...&lang=ar&page=1` |
| Movie sources | `GET /api/playback/movie/:tmdbId` |
| Episode sources | `GET /api/playback/tv/:tmdbId/seasons/:season/episodes/:episode` |
| Local title details | `GET /api/titles/:id?lang=ar` |
| Local media details | `GET /api/media/:id?lang=ar` |
| Local direct file | `GET /api/stream/:id` |
| Local HLS status | `GET /api/hls/:id/status` |
| Local HLS manifest | `GET /api/hls/:id/master.m3u8` |
| Sports channel keys | `GET /api/sports/status` |
| Sports HLS manifest | `GET /api/sports/stream/:channelKey/manifest.m3u8` |
| Provider status | `GET /api/streaming/providers` |
| Provider health | `GET /api/playback/provider-health` |

## Response handling

- Discovery home returns either global `hero`/`sections` cards or the local-library `hero`/`rows` shape when TMDB is disabled. The TV API client normalizes both shapes.
- Search returns `local` and `global` arrays. The TV API client combines them while preserving the local IDs and TMDB IDs.
- Playback routes return a wrapper with `playback.source`, `playback.alternatives`, `playback.subtitles`, and optional local fallback information.
- Source types include `hls`, `mp4`, `dash`, and `embed`. An embed page is not a direct stream URL.
- Local subtitle URLs and relative stream paths are resolved against the configured backend origin.
- Sports status returns channel keys; it does not itself prove that the channel stream is online.

## Existing provider architecture

The TV app does not implement or replace providers. It asks the backend playback routes to resolve sources and use the backend's existing provider manager and alternatives. Existing provider configuration remains in the server.

## CORS

The supplied `server/src/http/app.ts` already installs CORS headers for requests with an Origin and handles preflight OPTIONS requests. If a separately hosted production backend has different CORS rules, adjust those rules on the backend; do not disable browser security in the TV client.

## Playback requirements

The Samsung TV player prefers AVPlay for direct HLS/DASH and HTML5 video for supported MP4. TV provider sources that are only interactive external embed pages are skipped in the Samsung TV runtime; a reliable TV experience needs a direct compatible stream or a backend-resolved source.
