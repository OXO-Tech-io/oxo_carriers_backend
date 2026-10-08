import type { Logger } from 'pino';
import type { JwtPayload } from '../../types';

declare global {
  namespace Express {
    interface Request {
      employee?: JwtPayload;
      log?: Logger;
    }
  }
}

export {};
