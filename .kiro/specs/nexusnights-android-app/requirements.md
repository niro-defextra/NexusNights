    # Requirements Document

    ## Introduction

    This document specifies the requirements for transforming the existing NexusNight React web application into a native Android application using Capacitor. The project aims to preserve all existing functionality while providing a native mobile experience with Android-specific enhancements. The browser version must remain fully functional throughout and after development.

    Performance values, timing tolerances, and technical specifications in this document are derived from the actual NexusNight codebase (sync.ts, useRoomSync.ts, provider-compatibility.ts, RoomContext.tsx) to ensure consistency with the existing implementation.

    ## Glossary

    - **Capacitor**: Native runtime that bridges React web applications to native Android functionality
    - **WebView**: Android component that renders web content within native applications
    - **Browser_Version**: The existing React web application running in standard browsers
    - **Android_App**: The native Android application created through Capacitor integration
    - **Native_Bridge**: Capacitor's communication layer between JavaScript and Android native code
    - **Streaming_Provider**: External video source (VixSrc, VidSrc.mov, VidAPI) that supplies playback content
    - **HLS_Player**: HTTP Live Streaming playback engine using hls.js library
    - **Embed_Player**: iframe-based video player for external streaming providers
    - **Socket_Sync**: Socket.IO-based realtime synchronization for watch-together functionality
    - **TMDB_API**: The Movie Database API for content discovery and metadata
    - **Discord_OAuth**: Discord OAuth2 authentication flow with JWT sessions
    - **Safe_Area**: Android screen regions safe from system UI (status bar, navigation bar, notch)
    - **Room_State**: Synchronized playback state managed by the server for watch-together sessions
    - **ExoPlayer**: Android native media playback library (AndroidX Media3)
    - **Player.js**: Standard protocol for controlling embedded video players
    - **Failover_Logic**: Automatic switching between streaming providers when sources fail
    - **APK**: Android Package file for application distribution

    ## Requirements

    ### Requirement 1: Capacitor Integration Without Breaking Browser Version

    **User Story:** As a developer, I want to integrate Capacitor into the existing project, so that the application can run on Android while preserving the browser version.

    #### Acceptance Criteria

    1. THE Android_App SHALL be created using Capacitor 6.x framework within the existing NexusNight project structure
    2. THE Browser_Version SHALL continue to build and run without modifications to core React code
    3. THE Android_App SHALL share the same React codebase as Browser_Version (no code duplication)
    4. THE Android_App SHALL use package ID `com.nexusnights.app`
    5. WHEN the project is built, THE Build_System SHALL produce both browser assets and Android APK
    6. THE Android_App SHALL be structured in a separate `android/` directory within the project root
    7. THE Build_System SHALL support separate build commands for browser and Android targets
    8. THE Capacitor_Config SHALL reference the existing client build output directory

    ### Requirement 2: Android Project Structure

    **User Story:** As a developer, I want a proper Android native project structure, so that the application follows Android development standards.

    #### Acceptance Criteria

    1. THE Android_App SHALL contain proper Android manifest file with required permissions
    2. THE Android_App SHALL include gradle build configuration for dependency management
    3. THE Android_App SHALL define proper Android API level targets (minimum SDK 24, target SDK 34)
    4. THE Android_App SHALL include native Android resources (strings, colors, themes)
    5. THE Android_App SHALL contain MainActivity as the Capacitor bridge entry point
    6. THE Android_App SHALL support both debug and release build variants
    7. THE Project_Root SHALL contain `capacitor.config.ts` configuration file
    8. THE Android_Manifest SHALL request INTERNET, ACCESS_NETWORK_STATE, and WAKE_LOCK permissions

    ### Requirement 3: Video Playback Compatibility

    **User Story:** As a user, I want all video playback features to work on Android, so that I can watch content without limitations.

    #### Acceptance Criteria

    1. THE Android_App SHALL support HLS (M3U8) playback for local media streams
    2. THE Android_App SHALL support MP4 direct playback
    3. THE Android_App SHALL preserve UniversalEmbedPlayer component for embedded streaming provider players (VixSrc, VidSrc.mov, VidAPI)
    4. THE Android_App SHALL preserve provider selection and failover logic from Browser_Version
    5. THE Android_App SHALL support iframe-based embed players within WebView
    6. THE Android_App SHALL recognize that VixSrc, VidSrc.mov, and VidAPI do NOT implement Player.js protocol
    7. WHEN HLS playback is initiated, THE Android_WebView SHALL use hls.js or native HLS support
    8. WHEN video playback fails, THE Android_App SHALL attempt failover to alternative providers
    9. THE Android_App SHALL support audio track selection for multi-audio content
    10. THE Android_App SHALL render subtitles correctly during playback

    ### Requirement 4: Native Video Player Implementation (Conditional)

    **User Story:** As a developer, I want to implement native video playback if WebView compatibility issues are demonstrated, so that playback remains reliable.

    #### Acceptance Criteria

    1. WHERE WebView playback is demonstrated to be incompatible with streaming providers, THE Android_App MAY implement native playback using ExoPlayer
    2. WHERE native playback is implemented, THE Native_Player SHALL support HLS/M3U8 formats
    3. WHERE native playback is implemented, THE Native_Player SHALL support MP4 formats
    4. WHERE native playback is implemented, THE Native_Bridge SHALL expose play/pause/seek controls to React layer
    5. WHERE native playback is implemented, THE Native_Bridge SHALL report playback position to React layer
    6. WHERE native playback is implemented, THE Native_Player SHALL support subtitle rendering
    7. WHERE native playback is implemented, THE Native_Player SHALL support audio track selection
    8. WHERE native playback is implemented, THE Failover_Logic SHALL be preserved from Browser_Version

    ### Requirement 5: Fullscreen Video Experience

    **User Story:** As a user, I want immersive fullscreen video playback, so that I can enjoy content without distractions.

    #### Acceptance Criteria

    1. WHEN video enters fullscreen mode, THE Android_App SHALL hide status bar and navigation bar
    2. WHEN video enters fullscreen mode, THE Android_App SHALL support landscape orientation
    3. WHEN video enters fullscreen mode, THE Video_Player SHALL expand to fill entire screen
    4. WHEN video exits fullscreen mode, THE Android_App SHALL restore portrait orientation
    5. WHEN video exits fullscreen mode, THE Android_App SHALL show status bar and navigation bar
    6. THE Fullscreen_Controls SHALL remain accessible through touch interaction
    7. WHEN video is playing in fullscreen, THE Android_App SHALL prevent screen sleep using wake lock
    8. WHEN video playback ends or exits fullscreen, THE Wake_Lock SHALL be released

    ### Requirement 6: Mobile-First User Interface

    **User Story:** As a user, I want a mobile-optimized interface, so that the app feels natural on my phone.

    #### Acceptance Criteria

    1. THE Android_App SHALL display movie and TV series cards optimized for mobile viewport sizes
    2. THE Android_App SHALL implement touch-friendly controls with minimum 44px touch targets
    3. THE Android_App SHALL render responsive layouts that adapt to portrait and landscape orientations
    4. THE Navigation_UI SHALL use bottom navigation or mobile-appropriate patterns
    5. THE Search_Interface SHALL be optimized for mobile keyboard input
    6. THE Content_Discovery SHALL support smooth touch-based scrolling
    7. THE Android_App SHALL implement smooth page transitions and animations
    8. THE Android_App SHALL respect Safe_Area insets for status bar, navigation bar, and notch

    ### Requirement 7: Android Back Button Handling

    **User Story:** As a user, I want the Android back button to work intuitively, so that navigation feels natural.

    #### Acceptance Criteria

    1. WHEN user presses back button on video player, THE Android_App SHALL exit fullscreen if active
    2. WHEN user presses back button on detail page, THE Android_App SHALL navigate to previous screen
    3. WHEN user presses back button on home screen, THE Android_App SHALL show exit confirmation
    4. WHEN user presses back button during modal dialogs, THE Android_App SHALL close the dialog
    5. THE Back_Button SHALL follow Android navigation patterns consistently
    6. THE Android_App SHALL integrate with Capacitor's App plugin for back button handling

    ### Requirement 8: Authentication and Backend Integration

    **User Story:** As a user, I want to authenticate and sync data, so that my watch history and preferences are preserved.

    #### Acceptance Criteria

    1. THE Android_App SHALL support Discord_OAuth authentication flow
    2. THE Android_App SHALL register custom URL scheme `nexusnight://auth/callback` for OAuth redirects
    3. THE Android_App SHALL support fallback hash-based OAuth redirect (`/#/?token=...`) for browser compatibility
    4. THE Backend MAY detect Android user-agent and redirect to custom URL scheme instead of hash-based redirect
    5. THE Android_App SHALL store JWT tokens securely using Capacitor Storage plugin
    6. THE Android_App SHALL communicate with backend APIs using HTTPS
    7. THE Android_App SHALL maintain Socket_Sync connections for realtime features
    8. THE Android_App SHALL preserve all REST API endpoints from Browser_Version
    9. WHEN authentication completes, THE Android_App SHALL store user session persistently
    10. WHEN app restarts, THE Android_App SHALL restore authenticated session from secure storage

    ### Requirement 9: Room Synchronization and Watch-Together

    **User Story:** As a user, I want to create and join watch-together rooms, so that I can watch with friends.

    #### Acceptance Criteria

    1. THE Android_App SHALL support creating watch-together rooms with host permissions
    2. THE Android_App SHALL support joining rooms via invite codes
    3. THE Android_App SHALL maintain Socket_Sync connections for room state synchronization
    4. THE Android_App SHALL synchronize playback position, play/pause state across room members
    5. THE Android_App SHALL display real-time chat messages within rooms
    6. THE Android_App SHALL show participant lists with avatars and status
    7. WHEN room host changes media, THE Android_App SHALL navigate to new content automatically
    8. WHEN network reconnects, THE Android_App SHALL rejoin room and resync playback state
    9. THE Android_App SHALL support host controls for room management
    10. THE Android_App SHALL handle late-joiner synchronization automatically
    11. THE Sync_Logic SHALL use 0.4s hard seek threshold for immediate events
    12. THE Sync_Logic SHALL use 1.5s hard seek threshold for periodic sync checks
    13. THE Sync_Logic SHALL apply playback rate adjustment (0.94x or 1.06x) for drift between 0.4s and 1.5s
    14. THE Sync_Logic SHALL perform sync checks every 1000ms during active playback

    ### Requirement 10: Content Discovery Features

    **User Story:** As a user, I want to discover movies and TV shows, so that I can find content to watch.

    #### Acceptance Criteria

    1. THE Android_App SHALL fetch movie and TV series metadata from TMDB_API
    2. THE Android_App SHALL display content in categorized rows (trending, popular, genres)
    3. THE Android_App SHALL support search functionality with autocomplete
    4. THE Android_App SHALL render movie/TV detail pages with posters, descriptions, and cast information
    5. THE Android_App SHALL display season and episode listings for TV series
    6. THE Android_App SHALL support English and Arabic languages with proper RTL layout
    7. THE Android_App SHALL cache images efficiently to reduce network usage
    8. WHEN user selects content, THE Android_App SHALL check streaming provider availability

    ### Requirement 11: Network Connectivity Awareness

    **User Story:** As a user, I want the app to handle network issues gracefully, so that I understand connectivity problems.

    #### Acceptance Criteria

    1. WHEN network connection is lost, THE Android_App SHALL display connectivity warning
    2. WHEN network reconnects, THE Android_App SHALL resume operations automatically
    3. THE Android_App SHALL detect network state changes using Capacitor Network plugin
    4. WHEN video buffering occurs, THE Android_App SHALL display buffering indicator
    5. WHEN API requests fail due to network, THE Android_App SHALL show retry options
    6. THE Android_App SHALL cache essential data for offline browsing of previously loaded content
    7. WHEN streaming provider is unreachable, THE Android_App SHALL attempt Failover_Logic

    ### Requirement 12: Splash Screen and App Branding

    **User Story:** As a user, I want a polished app launch experience, so that the app feels professional.

    #### Acceptance Criteria

    1. THE Android_App SHALL display branded splash screen during app initialization
    2. THE Splash_Screen SHALL use NexusNight branding colors (blood-hot red, gilt gold, ink black)
    3. THE Android_App SHALL include high-resolution app icon for launcher and settings
    4. THE Splash_Screen SHALL automatically dismiss when app is ready
    5. THE App_Icon SHALL follow Android adaptive icon guidelines
    6. THE Android_App SHALL define proper app name in launcher as "NexusNight"

    ### Requirement 13: Subtitle Management

    **User Story:** As a user, I want to load and display subtitles, so that I can watch content in my preferred language.

    #### Acceptance Criteria

    1. THE Android_App SHALL support local subtitle files from media library
    2. THE Android_App SHALL support subtitle tracks from streaming providers
    3. THE Android_App SHALL support OpenSubtitles.com API for subtitle search and download
    4. THE Android_App SHALL render VTT format subtitles during playback
    5. THE Android_App SHALL allow users to select subtitle language from available options
    6. THE Android_App SHALL allow users to disable subtitles
    7. WHEN subtitles are enabled, THE Android_App SHALL render subtitles synchronized with video playback using browser native VTT rendering
    8. THE Android_App SHALL support 75+ languages for subtitle search

    ### Requirement 14: Performance and Resource Management

    **User Story:** As a user, I want the app to perform smoothly on mid-range devices, so that I don't experience lag or crashes.

    #### Acceptance Criteria

    1. THE Android_App SHALL target launch time under 5 seconds on mid-range devices (reference: Snapdragon 600 series)
    2. THE Android_App SHALL scroll content lists smoothly at 60fps
    3. THE Android_App SHALL manage memory efficiently to prevent out-of-memory crashes
    4. THE Android_App SHALL load images progressively with placeholders
    5. THE Android_App SHALL release video player resources when navigating away from playback
    6. THE Android_App SHALL clear unused image cache when memory pressure is detected
    7. WHEN app is backgrounded, THE Android_App SHALL pause video playback and release resources
    8. WHEN app returns to foreground, THE Android_App SHALL restore playback state if in room
    9. THE Build_Process SHALL target APK size under 100MB for release builds

    ### Requirement 15: Deep Linking Support

    **User Story:** As a user, I want to open shared content links, so that friends can send me specific movies or episodes.

    #### Acceptance Criteria

    1. THE Android_App SHALL register custom URL scheme `nexusnights://` for deep linking
    2. THE Android_App SHALL handle deep links to specific movie pages
    3. THE Android_App SHALL handle deep links to specific TV episodes
    4. THE Android_App SHALL handle deep links to room invitation URLs
    5. WHEN deep link is opened, THE Android_App SHALL navigate to corresponding content
    6. WHEN deep link references unavailable content, THE Android_App SHALL show appropriate error message

    ### Requirement 16: Native Sharing Functionality

    **User Story:** As a user, I want to share content with friends, so that I can recommend movies and invite to rooms.

    #### Acceptance Criteria

    1. THE Android_App SHALL support sharing movie links via Android share sheet
    2. THE Android_App SHALL support sharing TV episode links via Android share sheet
    3. THE Android_App SHALL support sharing room invitation codes via Android share sheet
    4. WHEN user triggers share, THE Android_App SHALL open native Android share dialog
    5. THE Share_Data SHALL include content title and deep link URL

    ### Requirement 17: Error Handling and Recovery

    **User Story:** As a user, I want clear error messages and recovery options, so that I can resolve issues independently.

    #### Acceptance Criteria

    1. WHEN video playback fails, THE Android_App SHALL display descriptive error message
    2. WHEN API request fails, THE Android_App SHALL show retry button
    3. WHEN authentication fails, THE Android_App SHALL guide user to re-authenticate
    4. WHEN streaming provider is unavailable, THE Android_App SHALL suggest alternative providers
    5. THE Android_App SHALL log errors for debugging without exposing sensitive data
    6. WHEN unrecoverable error occurs, THE Android_App SHALL provide option to return to home screen
    7. THE Error_Messages SHALL be localized in English and Arabic

    ### Requirement 18: Build and Distribution

    **User Story:** As a developer, I want to generate distributable APK files, so that users can install the application.

    #### Acceptance Criteria

    1. THE Build_System SHALL generate debug APK for testing at `android/app/build/outputs/apk/debug/app-debug.apk`
    2. THE Build_System SHALL generate release APK for distribution at `android/app/build/outputs/apk/release/app-release.apk`
    3. THE Release_APK SHALL be code-signed with proper keystore
    4. THE Build_Process SHALL minify and optimize JavaScript bundles
    5. THE Build_Process SHALL include all required Capacitor plugins in APK
    6. THE Android_App SHALL define proper version code and version name
    7. THE Build_System SHALL support automated builds via command line

    ### Requirement 19: Admin Dashboard Access

    **User Story:** As an admin, I want to access provider health monitoring, so that I can manage streaming sources.

    #### Acceptance Criteria

    1. THE Android_App SHALL provide access to admin dashboard for authenticated admins
    2. THE Admin_Dashboard SHALL display streaming provider health status
    3. THE Admin_Dashboard SHALL support mobile-optimized layout
    4. THE Admin_Dashboard SHALL allow admins to rescan media library
    5. WHERE admin features require authentication, THE Android_App SHALL verify admin token

    ### Requirement 20: Bilingual Support (English and Arabic)

    **User Story:** As a user, I want to use the app in my preferred language, so that I can understand all content.

    #### Acceptance Criteria

    1. THE Android_App SHALL support English and Arabic UI languages
    2. THE Android_App SHALL apply RTL (right-to-left) layout when Arabic is selected
    3. THE Android_App SHALL persist language preference across app restarts
    4. THE Android_App SHALL fetch TMDB metadata in selected language
    5. THE Android_App SHALL render Arabic text with proper font (IBM Plex Sans Arabic)
    6. THE Language_Switcher SHALL be accessible from settings or top navigation
    7. WHEN language changes, THE Android_App SHALL update all UI text without requiring restart

    ### Requirement 21: Guest Mode Support

    **User Story:** As a user without Discord, I want to join rooms as a guest, so that I can participate in watch-together sessions.

    #### Acceptance Criteria

    1. THE Android_App SHALL support guest mode using the same guest identity system from Browser_Version
    2. WHEN user joins room without authentication, THE Android_App SHALL generate guest ID with pattern `g-[12 hex chars]`
    3. THE Android_App SHALL persist guest ID in session storage across app sessions
    4. THE Android_App SHALL allow guest users to join rooms via invite codes
    5. THE Android_App SHALL display guest users with "Guest-" prefix in room member lists

    ### Requirement 22: NTP Clock Synchronization

    **User Story:** As a developer, I want accurate time synchronization, so that room playback stays in sync.

    #### Acceptance Criteria

    1. WHEN Socket connection is established, THE Android_App SHALL perform 5 NTP-style samples to calculate server clock offset
    2. THE Android_App SHALL recalculate clock offset every 30 seconds with 3 samples
    3. THE Android_App SHALL use best offset (lowest round-trip time) from sample set
    4. THE serverNow() function SHALL return local time adjusted by calculated offset

    ### Requirement 23: Admin Dashboard Access

    **User Story:** As an admin, I want to access the dashboard using admin token, so that I can manage the system without Discord.

    #### Acceptance Criteria

    1. THE Android_App SHALL support admin token authentication via x-admin-token header
    2. THE Android_App SHALL store admin token securely in Capacitor Secure Storage
    3. THE Android_App SHALL check /api/auth/is-admin endpoint to verify admin status
    4. THE Android_App SHALL allow access to admin dashboard when admin token is valid
    5. THE Admin_Dashboard SHALL be accessible at /#/admin route
