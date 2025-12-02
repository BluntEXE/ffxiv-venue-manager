// Apply database indexes using pg client
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyIndexes() {
  console.log('📊 Applying Performance Indexes...\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read SQL file
    const sqlFile = path.join(__dirname, 'add-indexes.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute SQL
    console.log('Creating indexes...');
    const result = await client.query(sql);

    console.log('\n✅ Indexes created successfully!\n');
    console.log('Index Summary:');

    // Display results from the verification query
    if (result.rows && result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log(`  - ${row.tablename}: ${row.indexname}`);
      });
    }

  } catch (error) {
    console.error('❌ Error applying indexes:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyIndexes();
