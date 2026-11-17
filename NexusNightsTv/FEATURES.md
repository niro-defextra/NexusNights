# NEXUSNIGHT TV — Implementation Status

This status describes what is present in the source tree. It does not claim that the package has already been installed or tested on the user's physical television.

## Implemented in source

- Arabic-first Samsung TV interface and 1920x1080 landscape layout.
- Home, movies, series, details, search, sports-channel list, and settings pages.
- Directional remote key handling, visible focus, and page/player back navigation.
- Existing `/api` backend routes for health, discovery, details, search, playback, local library, and sports.
- Local-only discovery fallback when TMDB is disabled.
- Local-library playback using the existing direct and HLS routes.
- Primary source plus alternative source handling.
- Samsung AVPlay asynchronous preparation for direct HLS/DASH.
- HTML5 video playback for supported MP4/HLS sources.
- Subtitle URL normalization and selection of a language-preferred subtitle where supported.
- Live-player UI avoids showing VOD seeking controls.
- Connection, loading, empty, and playback error states.

## Platform limitations / dependencies

- External `embed` pages are not treated as direct streams. On Samsung TV the app skips them and tries alternatives; if only embed sources exist, playback cannot be guaranteed.
- Exact codec, subtitle, audio-track, AVPlay buffering, and remote key behavior require testing on the physical RU7300 TV.
- Sports channel keys come from the configured server map. A key in the map is not a guarantee that the upstream stream is currently available.
- Watch-history synchronization, watchlist, advanced audio-track selection, EPG rendering, and authenticated user-specific features are not implemented by this TV client unless the supplied backend exposes corresponding APIs.
- The UI is Arabic-first. The search keyboard contains Arabic and English layouts; a complete English translation of every screen is not claimed.

## Still required on the user's Windows machine

- Run the Tizen CLI build and sign using the existing Samsung certificate profile.
- Install and launch the resulting WGT on the connected Samsung UA55RU7300SXEG.
- Verify real API connectivity and test at least one known direct HLS/MP4 source on the TV.
