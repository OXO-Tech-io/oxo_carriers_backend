import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodType } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Validates `req[source]` against the given Zod schema. On success, replaces
 * the contents of `req[source]` with the parsed (coerced) values.
 *
 * Express 5 makes `req.query` a non-writable getter, so we cannot reassign
 * `req.query = parsed`. Instead we mutate the existing object in place so the
 * mutation works for body/params/query alike.
 */
export const validate = (schema: ZodType, source: Source = 'body'): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[source]);
    const target = req[source] as Record<string, unknown> | undefined;

    if (target && typeof target === 'object' && parsed && typeof parsed === 'object') {
      for (const key of Object.keys(target)) {
        delete target[key];
      }
      Object.assign(target, parsed as Record<string, unknown>);
    }

    next();
  };
};
