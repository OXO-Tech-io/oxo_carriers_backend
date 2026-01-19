import { initializeDatabase } from '../config/initDatabase';

console.log('Starting database initialization...');
initializeDatabase()
  .then(() => {
    console.log('Database initialization finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
