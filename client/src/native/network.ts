import { Capacitor } from '@capacitor/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { useEffect, useState } from 'react';

export function useNetworkStatus() {
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: true,
    connectionType: 'wifi',
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const handleOnline = () => setStatus({ connected: true, connectionType: 'wifi' });
      const handleOffline = () => setStatus({ connected: false, connectionType: 'none' });
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    Network.getStatus().then(setStatus).catch(() => {});

    const listener = Network.addListener('networkStatusChange', (s) => {
      setStatus(s);
    });

    return () => {
      listener.then(handle => handle.remove()).catch(() => {});
    };
  }, []);

  return status;
}
