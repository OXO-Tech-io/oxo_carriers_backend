const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '15432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'oxo_carriers',
  });

  try {
    await client.connect();
    console.log('Connected to DB successfully!');
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('Tables in DB:');
    res.rows.forEach(row => console.log(`- ${row.table_name}`));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
