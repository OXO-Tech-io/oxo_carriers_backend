import { Global, Module } from '@nestjs/common';
import { db, pool } from '../db';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    { provide: DRIZZLE_DB, useValue: db },
    { provide: PG_POOL, useValue: pool },
  ],
  exports: [DRIZZLE_DB, PG_POOL],
})
export class DatabaseModule {}
