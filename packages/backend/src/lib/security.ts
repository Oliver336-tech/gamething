import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

const toBase64Url = (input: string | Buffer) => Buffer.from(input).toString('base64url');
const fromBase64Url = (input: string) => Buffer.from(input, 'base64url').toString('utf8');

export type TokenPayload = Record<string, unknown> & {
  exp?: number;
  type?: string;
  sid?: string;
  sub?: string;
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomUUID();
  const digest = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return `${salt}:${digest}`;
};

export const verifyPassword = async (password: string, hashed: string): Promise<boolean> => {
  const [salt, digest] = hashed.split(':');
  if (!salt || !digest) return false;
  const candidate = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(digest));
};

export const signToken = (
  payload: TokenPayload,
  secret: string,
  expiresInSeconds: number,
): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = { ...payload, exp };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedBody = toBase64Url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');

  return `${data}.${signature}`;
};

export const verifyToken = (token: string, secret: string): TokenPayload => {
  const [headerPart, bodyPart, signature] = token.split('.');
  if (!headerPart || !bodyPart || !signature) {
    throw new Error('Malformed token');
  }
  const data = `${headerPart}.${bodyPart}`;
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid signature');
  }
  const payload = JSON.parse(fromBase64Url(bodyPart)) as TokenPayload;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
};
