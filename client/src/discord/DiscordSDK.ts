/**
 * Discord Embedded App SDK Integration
 * Initializes Discord Activity and provides hooks for accessing Discord context.
 *
 * Key flow:
 *  1. discordSdk.ready()       — wait for the iframe bridge
 *  2. discordSdk.commands.authorize()  — pop Discord OAuth consent (returns a code)
 *  3. POST /api/token  with code → get access_token from our server
 *  4. discordSdk.commands.authenticate({ access_token }) — tell the SDK who we are
 *  5. Now channelId, user, voice state, etc. are available.
 */

import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk';
import { u } from '../api';

// ── Discord environment detection ───────────────────────────────────────────
// Discord Activities run inside `*.discordsays.com` iframes, with a `frame_id`
// query param.  We also allow explicit `/discord` or `#/discord` paths for
// development.
const isDiscordEnvironment =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('.discordsays.com') ||
    window.location.pathname.includes('/discord') ||
    window.location.hash.includes('#/discord') ||
    new URLSearchParams(window.location.search).has('frame_id'));

const clientId: string = process.env.DISCORD_CLIENT_ID || '';

// ── SDK instance ────────────────────────────────────────────────────────────
export const discordSdk =
  isDiscordEnvironment && clientId
    ? new DiscordSDK(clientId)
    : new DiscordSDKMock(
        clientId || 'mock-client-id',
        'mock-guild-id',
        'mock-channel-id',
        'mock-location-id',
      );

export const isRealSDK = isDiscordEnvironment && !!clientId;

// ── State ───────────────────────────────────────────────────────────────────
let isReady = false;
let readyPromise: Promise<void> | null = null;
let accessToken: string | null = null;

/** The authenticated Discord user (set after the full OAuth flow). */
export interface AuthedDiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}
let authedUser: AuthedDiscordUser | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}
export function getAuthedUser(): AuthedDiscordUser | null {
  return authedUser;
}

// ── Initialization ──────────────────────────────────────────────────────────
/**
 * Initialize Discord SDK – call once when the Activity loads.
 * Completes the full authorize → token exchange → authenticate cycle.
 */
export async function initializeDiscordSDK(): Promise<void> {
  if (isReady) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    try {
      console.log('[Discord SDK] Waiting for ready…');
      await discordSdk.ready();
      console.log('[Discord SDK] Ready.  channelId =', discordSdk.channelId);

      // ── 1. Authorize ──────────────────────────────────────────────────
      const { code } = await discordSdk.commands.authorize({
        client_id: clientId || 'mock-client-id',
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds', 'guilds.members.read'],
      });
      console.log('[Discord SDK] Authorized – exchanging code…');

      // ── 2. Exchange code for access_token (via our backend) ───────────
      if (isRealSDK) {
        try {
          const tokenUrl = u('/api/token') || '/api/token';
          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });

          if (tokenRes.ok) {
            const data = (await tokenRes.json()) as { access_token?: string };
            if (data.access_token) {
              accessToken = data.access_token;
              console.log('[Discord SDK] Token exchanged successfully.');

              // ── 3. Authenticate with the SDK ──────────────────────────
              const authResult = await discordSdk.commands.authenticate({
                access_token: accessToken,
              });
              if (authResult?.user) {
                authedUser = authResult.user as AuthedDiscordUser;
                console.log('[Discord SDK] Authenticated as:', authedUser.username);
              }
            } else {
              console.warn('[Discord SDK] Token exchange returned no access_token – continuing as guest.');
            }
          } else {
            console.warn('[Discord SDK] Token exchange failed:', tokenRes.status, '– continuing as guest.');
          }
        } catch (err) {
          console.warn('[Discord SDK] Token exchange error:', err, '– continuing as guest.');
        }
      }

      isReady = true;
      console.log('[Discord SDK] Initialization complete.');
    } catch (error) {
      console.error('[Discord SDK] Initialization failed:', error);
      // Mark as ready so the UI doesn't hang; fallback behavior will apply.
      isReady = true;
    }
  })();

  return readyPromise;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Current user (from authenticate or from getInstanceConnectedParticipants). */
export async function getDiscordUser(): Promise<AuthedDiscordUser | null> {
  if (!isReady) await initializeDiscordSDK();

  // Prefer the already-authenticated user (fastest, most reliable)
  if (authedUser) return authedUser;

  try {
    const { participants } = await discordSdk.commands.getInstanceConnectedParticipants();
    if (participants.length > 0) {
      return participants[0] as unknown as AuthedDiscordUser;
    }
    return null;
  } catch (error) {
    console.error('[Discord SDK] Failed to get user:', error);
    return null;
  }
}

/** Channel info for the current voice channel. */
export async function getDiscordChannel() {
  if (!isReady) await initializeDiscordSDK();

  try {
    if (!discordSdk.channelId) return null;
    return await discordSdk.commands.getChannel({ channel_id: discordSdk.channelId });
  } catch (error) {
    console.error('[Discord SDK] Failed to get channel:', error);
    return null;
  }
}

/** All participants currently in this Activity instance. */
export async function getVoiceChannelParticipants() {
  if (!isReady) await initializeDiscordSDK();

  try {
    const { participants } = await discordSdk.commands.getInstanceConnectedParticipants();
    return participants || [];
  } catch (error) {
    console.error('[Discord SDK] Failed to get participants:', error);
    return [];
  }
}

/**
 * Subscribe to voice state updates (users joining / leaving).
 *
 * The Embedded App SDK's `subscribe()` returns an unsubscribe function directly.
 * We also re-fetch the full participants list on each update (the event payload
 * is a delta, not the full list).
 */
export function subscribeToVoiceStateUpdates(
  callback: (participants: any[]) => void,
): () => void {
  if (!isReady) {
    console.warn('[Discord SDK] Not ready – cannot subscribe to voice state updates.');
    return () => {};
  }

  if (!discordSdk.channelId) {
    console.warn('[Discord SDK] No channelId – cannot subscribe to voice state updates.');
    return () => {};
  }

  let cancelled = false;

  const handler = async () => {
    if (cancelled) return;
    const participants = await getVoiceChannelParticipants();
    if (!cancelled) callback(participants);
  };

  // The SDK returns a promise that resolves once subscribed.
  // We store a flag-based cleanup because the subscribe/unsubscribe API
  // varies across SDK versions.
  const subscribePromise = discordSdk
    .subscribe('VOICE_STATE_UPDATE', handler, { channel_id: discordSdk.channelId })
    .catch((err: unknown) => {
      console.error('[Discord SDK] Failed to subscribe to voice state updates:', err);
    });

  return () => {
    cancelled = true;
    // Best-effort unsubscribe
    subscribePromise.then(() => {
      discordSdk
        .unsubscribe('VOICE_STATE_UPDATE', handler, { channel_id: discordSdk.channelId! })
        .catch(() => {/* already torn down */});
    }).catch(() => {});
  };
}

/** Update Rich Presence for the current user (type 3 = Watching). */
export async function setActivity(details: string, state?: string) {
  if (!isReady) await initializeDiscordSDK();

  try {
    await discordSdk.commands.setActivity({
      activity: {
        type: 3, // Watching
        details,
        state,
        timestamps: { start: Date.now() },
      },
    });
  } catch (error) {
    console.error('[Discord SDK] Failed to set activity:', error);
  }
}
