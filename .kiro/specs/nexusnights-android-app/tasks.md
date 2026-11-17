# NexusNight Android Application Tasks

- [x] Phase 1: Capacitor 6 Setup & Android Project Initialization
  - [x] Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` and required plugins
  - [x] Create `capacitor.config.ts` targeting `client/dist` and package `com.nexusnights.app`
  - [x] Initialize `android/` project via `npx cap add android`
  - [x] Configure `AndroidManifest.xml` (permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`; custom schemes: `nexusnight://` & `nexusnights://`)
  - [x] Configure Android resources (colors, themes, launcher app name "NexusNight")
  - [x] Configure JDK 21 LTS environment for Gradle 8.2 compatibility

- [x] Phase 2: Dynamic API & Storage Integration
  - [x] Create `client/src/native/platform.ts` for dynamic backend URL (`https://nexusunights.tech`)
  - [x] Update `client/src/api.ts` to use dynamic base URL without breaking browser relative paths
  - [x] Connect `client/src/room/RoomContext.tsx` Socket.IO to server URL in native mode
  - [x] Implement persistent storage adapter (`nativeStorage`) in `client/src/auth/AuthContext.tsx`
  - [x] Support Discord OAuth callback and token exchange in mobile WebView

- [x] Phase 3: Video Player, Fullscreen & WakeLock
  - [x] Implement `client/src/native/screen.ts` for landscape orientation locking and status bar hiding
  - [x] Integrate wake-lock (`@capacitor-community/keep-awake`) during active video playback
  - [x] Wire fullscreen & orientation management in `client/src/player/Player.tsx`
  - [x] Wire fullscreen & orientation management in `client/src/player/embed/UniversalEmbedPlayer.tsx`
  - [x] Configure Android WebView settings in `MainActivity.java` for iframe & mixed content support

- [x] Phase 4: Mobile UI, Navigation & Back Button Handling
  - [x] Implement stack-based hardware back button handler (`client/src/native/back-button.ts`)
  - [x] Handle back button in `TopBar.tsx`, `Watch.tsx`, `GlobalTitle.tsx`, and `AdminDashboard.tsx`
  - [x] Ensure minimum 44px touch targets on mobile interactive controls
  - [x] Apply safe area insets for notches, status bars, and navigation bars in `index.css`

- [x] Phase 5: Deep Linking & Native Sharing
  - [x] Implement `client/src/native/deep-links.ts` for `nexusnight://` and `nexusnights://`
  - [x] Implement `client/src/native/share.ts` with Android Share Sheet integration
  - [x] Add native share button to movie/series detail pages and room invite modals

- [x] Phase 6: Automated Build & APK Verification
  - [x] Create `scripts/build-android.js` automated build runner
  - [x] Add `npm run build:android` and `npm run build:browser` scripts in `package.json`
  - [x] Execute complete build and generate `app-debug.apk`
