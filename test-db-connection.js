// Quick database connection test
const { Client } = require('pg');
require('dotenv').config();

const testConnection = async () => {
  console.log('Testing database connection...\n');

  // Test with DATABASE_URL (Transaction Pooler - port 6543)
  console.log('1. Testing DATABASE_URL (port 6543 - pooler)...');
  const poolerClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await poolerClient.connect();
    const result = await poolerClient.query('SELECT NOW()');
    console.log('   ✅ Connection successful!');
    console.log('   Server time:', result.rows[0].now);
    await poolerClient.end();
  } catch (error) {
    console.log('   ❌ Connection failed:', error.message);
  }

  console.log('\n2. Testing DIRECT_URL (port 5432 - direct)...');
  const directClient = new Client({
    connectionString: process.env.DIRECT_URL,
  });

  try {
    await directClient.connect();
    const result = await directClient.query('SELECT NOW()');
    console.log('   ✅ Connection successful!');
    console.log('   Server time:', result.rows[0].now);
    await directClient.end();
  } catch (error) {
    console.log('   ❌ Connection failed:', error.message);
  }

  console.log('\nConnection test complete.');
};

testConnection().catch(console.error);
