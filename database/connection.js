const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Database connection configuration
const config = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'clown_club',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 5432,
  // Connection pool settings
  max: 10, // Maximum number of clients in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
};

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  // Initialize connection pool
  async connect() {
    try {
      this.pool = new Pool(config);

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('[DB] Connected successfully');

      // Handle errors
      this.pool.on('error', (err) => {
        console.error('[DB] Unexpected error:', err);
        this.isConnected = false;
      });

      return true;
    } catch (error) {
      console.error('[DB] Failed to connect:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  // Execute a query
  async query(text, params = []) {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      // Log slow queries (>100ms)
      if (duration > 100) {
        console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 50) + '...');
      }

      return result;
    } catch (error) {
      console.error('[DB] Query error:', error.message);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    }
  }

  // Get a client from the pool (for transactions)
  async getClient() {
    if (!this.isConnected || !this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return await this.pool.connect();
  }

  // Close all connections
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('[DB] Connections closed');
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as healthy');
      return result.rows[0].healthy === 1;
    } catch (error) {
      return false;
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      totalCount: this.pool?.totalCount || 0,
      idleCount: this.pool?.idleCount || 0,
      waitingCount: this.pool?.waitingCount || 0,
    };
  }
}

// Export singleton instance
const db = new DatabaseConnection();
module.exports = db;

// Helper function for transactions
const withTransaction = async (callback) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports.withTransaction = withTransaction;
