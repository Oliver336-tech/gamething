import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type { Action, CombatState } from '@gamething/shared';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type CombatStore = {
  state: CombatState | null;
  connectionStatus: ConnectionStatus;
  connect: (url: string) => void;
  sendAction: (action: Action) => void;
};

let socket: WebSocket | null = null;

export const useCombatStore = create<CombatStore>((set) => ({
  state: null,
  connectionStatus: 'disconnected',
  connect: (url: string) => {
    set({ connectionStatus: 'connecting' });

    socket?.close();
    socket = new WebSocket(url);

    socket.onopen = () => set({ connectionStatus: 'connected' });
    socket.onclose = () => set({ connectionStatus: 'disconnected' });
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'state') {
          set({ state: payload.payload as CombatState });
        }
      } catch (error) {
        console.error('Failed to parse message', error);
      }
    };
  },
  sendAction: (action: Action) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    }
  },
}));

export const useWebSocketConnection = (url: string): void => {
  const connectRef = useRef(useCombatStore.getState().connect);

  useEffect(() => {
    connectRef.current(url);
  }, [url]);
};
