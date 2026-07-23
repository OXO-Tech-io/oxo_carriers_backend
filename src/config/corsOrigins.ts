import { env } from './env';

export const normalizeOrigin = (origin?: string | null): string => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '').toLowerCase();
};

const rawAllowedOrigins = [
  'https://oxo-carriers-frontend-297614602590.us-central1.run.app',
  'http://localhost:3000',
  'http://localhost:5173',
  env.FRONTEND_URL,
  ...(env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
].filter(Boolean) as string[];

export const allowedOrigins = rawAllowedOrigins.map((origin) => normalizeOrigin(origin)).filter(Boolean);

const isLocalDevOrigin = (origin: string) => origin.includes('localhost') || origin.includes('127.0.0.1');

export const isOriginAllowed = (origin?: string | null) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (!env.IS_PRODUCTION && isLocalDevOrigin(normalizedOrigin)) return true;
  return false;
};
