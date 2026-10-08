import { SetMetadata } from '@nestjs/common';

export const SKIP_SESSION_CHECK_KEY = 'skipSessionCheck';
/**
 * Marks a route as exempt from JwtAuthGuard's OCD-455 single-active-session
 * check (still requires a valid token). Used only by POST /auth/claim-sessions,
 * which is the one endpoint that's *supposed* to run for a session the guard
 * would otherwise reject as superseded - that's the request establishing it
 * as the new active session in the first place.
 */
export const SkipSessionCheck = () => SetMetadata(SKIP_SESSION_CHECK_KEY, true);
