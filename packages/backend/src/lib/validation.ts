type ValidationResult<T> = { success: true; data: T } | { success: false; message: string };

export const validateCredentials = (
  input: unknown,
): ValidationResult<{ email: string; password: string }> => {
  if (!input || typeof input !== 'object') return { success: false, message: 'Invalid payload' };
  const { email, password } = input as Record<string, unknown>;
  if (typeof email !== 'string' || !email.includes('@'))
    return { success: false, message: 'Email is invalid' };
  if (typeof password !== 'string' || password.length < 8) {
    return { success: false, message: 'Password must be at least 8 characters' };
  }
  return { success: true, data: { email, password } };
};

export const validateRefresh = (input: unknown): ValidationResult<{ refreshToken: string }> => {
  if (!input || typeof input !== 'object') return { success: false, message: 'Invalid payload' };
  const { refreshToken } = input as Record<string, unknown>;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    return { success: false, message: 'Refresh token missing' };
  }
  return { success: true, data: { refreshToken } };
};

export const validateStringParam = (value: unknown, field: string): ValidationResult<string> => {
  if (typeof value !== 'string' || value.length === 0) {
    return { success: false, message: `${field} is required` };
  }
  return { success: true, data: value };
};
