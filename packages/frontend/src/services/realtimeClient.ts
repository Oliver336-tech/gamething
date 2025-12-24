export type RealtimeCallbacks<TState> = {
  onState: (state: TState) => void;
  onError?: (message: string) => void;
};

export const createRealtimeClient = <TState>(
  url: string,
  matchId: string,
  userId: string,
  callbacks: RealtimeCallbacks<TState>,
) => {
  const socket = new WebSocket(`${url}?matchId=${encodeURIComponent(matchId)}&userId=${encodeURIComponent(userId)}`);

  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'state') {
      callbacks.onState(payload.payload as TState);
    } else if (payload.type === 'error' && callbacks.onError) {
      callbacks.onError(payload.message ?? 'Unknown realtime error');
    }
  };

  const sendAction = (action: unknown) => {
    socket.send(JSON.stringify({ type: 'action', matchId, action }));
  };

  const requestSync = () => {
    socket.send(JSON.stringify({ type: 'sync-request', matchId }));
  };

  return { socket, sendAction, requestSync };
};
