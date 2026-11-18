/**
 * React Hook for Discord Activity Integration
 * Provides easy access to Discord context and functions.
 *
 * Key improvements:
 *  - Uses authenticated user from the full OAuth flow (not just participants)
 *  - Properly tracks SDK readiness with error recovery
 *  - Provides channelId for automatic room-to-voice-channel mapping
 *  - Clean subscribe/unsubscribe lifecycle
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  discordSdk,
  isRealSDK,
  initializeDiscordSDK,
  getDiscordUser,
  getDiscordChannel,
  getVoiceChannelParticipants,
  subscribeToVoiceStateUpdates,
  setActivity,
  getAuthedUser,
  type AuthedDiscordUser,
} from './DiscordSDK';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null | undefined;
  global_name: string | null | undefined;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id: string | null | undefined;
  name?: string;
}

export interface DiscordParticipant {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null | undefined;
  global_name: string | null | undefined;
}

export interface UseDiscordReturn {
  isReady: boolean;
  isLoading: boolean;
  error: Error | null;
  user: DiscordUser | null;
  channel: DiscordChannel | null;
  channelId: string | null;
  participants: DiscordParticipant[];
  isRealDiscord: boolean;
  updateActivity: (details: string, state?: string) => Promise<void>;
}

/**
 * Hook to access Discord Activity context.
 * Automatically initializes SDK and provides user, channel, and participant data.
 */
export function useDiscord(): UseDiscordReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [channel, setChannel] = useState<DiscordChannel | null>(null);
  const [participants, setParticipants] = useState<DiscordParticipant[]>([]);
  const retryCount = useRef(0);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Discord SDK (full authorize → token → authenticate cycle)
        await initializeDiscordSDK();

        if (!mounted) return;

        // Get Discord context (parallel fetch)
        const [discordUser, discordChannel, discordParticipants] = await Promise.all([
          getDiscordUser(),
          getDiscordChannel(),
          getVoiceChannelParticipants(),
        ]);

        if (!mounted) return;

        setUser(discordUser as any);
        setChannel(discordChannel as any);
        setParticipants(discordParticipants as any);
        setIsReady(true);

        // Subscribe to participant updates (joins / leaves)
        unsubscribe = subscribeToVoiceStateUpdates((newParticipants) => {
          if (mounted) setParticipants(newParticipants as any);
        });
      } catch (err) {
        if (!mounted) return;
        const e = err instanceof Error ? err : new Error('Discord initialization failed');
        setError(e);
        console.error('[useDiscord] Initialization error:', err);

        // Retry up to 2 times with exponential backoff
        if (retryCount.current < 2) {
          retryCount.current++;
          const delay = retryCount.current * 2000;
          console.log(`[useDiscord] Retrying in ${delay}ms (attempt ${retryCount.current})…`);
          setTimeout(() => { if (mounted) initialize(); }, delay);
          return;
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void initialize();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const updateActivity = useCallback(async (details: string, state?: string) => {
    try {
      await setActivity(details, state);
    } catch (err) {
      console.error('[useDiscord] Failed to update activity:', err);
    }
  }, []);

  return {
    isReady,
    isLoading,
    error,
    user,
    channel,
    channelId: discordSdk.channelId ?? null,
    participants,
    isRealDiscord: isRealSDK,
    updateActivity,
  };
}

/**
 * Simpler hook if you only need to know if Discord is ready.
 */
export function useDiscordReady(): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initializeDiscordSDK()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error('[useDiscordReady] Initialization error:', err);
        setIsReady(false);
      });
  }, []);

  return isReady;
}
