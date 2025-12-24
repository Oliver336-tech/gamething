import { apiRequest } from './apiClient';

export const listFriends = async (token?: string) => {
  return apiRequest<{ friendships: Array<{ id: string; status: string; requester: any; addressee: any }> }>(
    '/friends',
    { token },
  );
};

export const sendFriendRequest = async (email: string, token?: string) => {
  return apiRequest('/friends/request', { method: 'POST', body: { email }, token });
};

export const acceptFriendRequest = async (id: string, token?: string) => {
  return apiRequest(`/friends/${id}/accept`, { method: 'POST', token });
};

export const removeFriend = async (id: string, token?: string) => {
  return apiRequest(`/friends/${id}`, { method: 'DELETE', token });
};

export const presence = async (token?: string) => {
  return apiRequest<{ presence: Array<{ userId: string; email: string; online: boolean }> }>('/friends/presence', {
    token,
  });
};
