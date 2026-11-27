const sql = require("mssql");
const { getPool } = require("../../config/db");

const userColumns = `
    id AS id,
    name,
    email,
    mobile,
    passwordHash,
    passwordSalt,
    createdAt,
    updatedAt
`;

async function findByMobile(mobile) {
    const result = await getPool().request()
        .input("mobile", sql.NVarChar(32), mobile)
        .query(`SELECT ${userColumns} FROM dbo.Users WHERE mobile = @mobile`);
    return result.recordset[0] || null;
}

async function findDuplicate(email, mobile) {
    const result = await getPool().request()
        .input("email", sql.NVarChar(320), email)
        .input("mobile", sql.NVarChar(32), mobile)
        .query(`
            SELECT TOP (1) id AS id
            FROM dbo.Users
            WHERE email = @email OR mobile = @mobile
        `);
    return result.recordset[0] || null;
}

async function create(user) {
    const result = await getPool().request()
        .input("name", sql.NVarChar(200), user.name)
        .input("email", sql.NVarChar(320), user.email)
        .input("mobile", sql.NVarChar(32), user.mobile)
        .input("passwordHash", sql.Char(128), user.passwordHash)
        .input("passwordSalt", sql.Char(32), user.passwordSalt)
        .query(`
            INSERT INTO dbo.Users (name, email, mobile, passwordHash, passwordSalt)
            OUTPUT
                inserted.id AS id,
                inserted.name AS name,
                inserted.email AS email,
                inserted.mobile AS mobile,
                inserted.passwordHash AS passwordHash,
                inserted.passwordSalt AS passwordSalt,
                inserted.createdAt AS createdAt,
                inserted.updatedAt AS updatedAt
            VALUES (@name, @email, @mobile, @passwordHash, @passwordSalt)
        `);
    return result.recordset[0];
}

async function findById(id) {
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return null;
    }

    const result = await getPool().request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`
            SELECT id AS id, name, email, mobile, createdAt, updatedAt
            FROM dbo.Users
            WHERE id = @id
        `);
    return result.recordset[0] || null;
}

module.exports = { findByMobile, findDuplicate, create, findById };