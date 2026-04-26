import neo4j, { Driver, Session, Integer } from "neo4j-driver";

/**
 * Neo4j driver singleton for Chess Masti adaptive coaching features.
 *
 * Connection details come from environment variables:
 * - NEO4J_URI: bolt+s://xxxxx.databases.neo4j.io (Aura Free Tier)
 * - NEO4J_USERNAME: typically "neo4j"
 * - NEO4J_PASSWORD: your database password
 *
 * Read-only queries recommended for production to prevent accidental data modification.
 */

let driver: Driver | null = null;

/**
 * Get or create the Neo4j driver instance.
 * Lazily initialized on first call.
 */
export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !username || !password) {
      throw new Error(
        "Neo4j connection not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD environment variables."
      );
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10000,
      disableLosslessIntegers: true,
    });

    // [PHASE-B-DIAGNOSTICS] one-time per-runtime log of which Aura instance the
    // driver actually connected to. Host only — never log the full URI or password.
    try {
      const uriHost = new URL(process.env.NEO4J_URI ?? "neo4j+s://unknown").host;
      console.log("neo4j.driver.connected", {
        uriHost,
        username: process.env.NEO4J_USERNAME,
      });
    } catch (e) {
      console.log("neo4j.driver.connected", {
        uriHost: "parse-failed",
        username: process.env.NEO4J_USERNAME,
        parseError: (e as Error).message,
      });
    }
  }

  return driver;
}

/**
 * Execute a read-only Cypher query and return results.
 *
 * @param cypher - Cypher query string
 * @param params - Query parameters (use parameterized queries to prevent injection)
 * @returns Array of records
 *
 * @example
 * const puzzles = await executeRead(
 *   "MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme {name: $theme}) RETURN p LIMIT 10",
 *   { theme: "fork" }
 * );
 */
export async function executeRead<T = any>(
  cypher: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const driver = getDriver();
  const session: Session = driver.session(); // No defaultAccessMode for Aura 2026.02

  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Execute a write Cypher query (use sparingly in production).
 *
 * @param cypher - Cypher query string
 * @param params - Query parameters
 * @returns Array of records
 */
export async function executeWrite<T = any>(
  cypher: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const driver = getDriver();
  const session: Session = driver.session(); // No defaultAccessMode for Aura 2026.02

  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Verify Neo4j connection health.
 * Returns true if connected, false otherwise.
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    const driver = getDriver();
    await driver.verifyConnectivity();
    return true;
  } catch (error) {
    console.error("Neo4j connection verification failed:", error);
    return false;
  }
}

/**
 * Close the Neo4j driver connection.
 * Call this when shutting down the application.
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Check if Neo4j is configured and available.
 * Returns false if environment variables are not set (graceful degradation).
 */
export function isNeo4jConfigured(): boolean {
  return !!(
    process.env.NEO4J_URI &&
    process.env.NEO4J_USERNAME &&
    process.env.NEO4J_PASSWORD
  );
}
