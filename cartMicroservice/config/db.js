const sql = require("mssql");
const fs = require("node:fs");
const path = require("node:path");

let pool;
const schema = fs.readFileSync(path.join(__dirname, "../sql/schema.sql"), "utf8");

function getConfig(database = process.env.SQL_DATABASE) {
    const { SQL_SERVER: server, SQL_USER: user, SQL_PASSWORD: password } = process.env;
    if (!server || !database || !user || !password) {
        throw new Error("SQL_SERVER, SQL_DATABASE, SQL_USER, and SQL_PASSWORD are required");
    }

    return {
        server,
        port: Number(process.env.SQL_PORT || 1433),
        user,
        password,
        database,
        options: {
            encrypt: process.env.SQL_ENCRYPT !== "false",
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === "true",
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
        connectionTimeout: 30000,
        requestTimeout: 30000,
    };
}

async function createLocalDatabaseIfNeeded() {
    if (process.env.SQL_CREATE_DATABASE !== "true") return;

    const database = process.env.SQL_DATABASE;
    if (!/^[A-Za-z0-9_-]+$/.test(database || "")) {
        throw new Error("SQL_DATABASE contains unsupported characters");
    }

    const bootstrapPool = await new sql.ConnectionPool(getConfig("master")).connect();
    try {
        await bootstrapPool.request()
            .input("databaseName", sql.NVarChar(128), database)
            .query(`IF DB_ID(@databaseName) IS NULL EXEC('CREATE DATABASE [${database}]')`);
    } finally {
        await bootstrapPool.close();
    }
}

async function connect() {
    if (pool?.connected) return pool;

    await createLocalDatabaseIfNeeded();
    pool = await new sql.ConnectionPool(getConfig()).connect();
    try {
        if (process.env.SQL_AUTO_CREATE_SCHEMA === "true") {
            await pool.request().query(schema);
        } else {
            await pool.request().query("SELECT 1");
        }
    } catch (error) {
        await pool.close();
        pool = undefined;
        throw error;
    }

    console.log("Cart SQL Server connection established");
    return pool;
}

function getPool() {
    if (!pool?.connected) {
        throw new Error("Cart SQL Server connection has not been initialized");
    }
    return pool;
}

module.exports = { connect, getPool };
