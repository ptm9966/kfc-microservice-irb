const sql = require("mssql");
const { getPool } = require("../../config/db");

const cartSelect = `
    SELECT
        id AS _id,
        userId,
        productId,
        image,
        title,
        description AS [desc],
        price,
        qty,
        createdAt,
        updatedAt
    FROM dbo.CartItems
`;

const cartOutput = `
    inserted.id AS _id,
    inserted.userId,
    inserted.productId,
    inserted.image,
    inserted.title,
    inserted.description AS [desc],
    inserted.price,
    inserted.qty,
    inserted.createdAt,
    inserted.updatedAt
`;

function isValidCartId(id) {
    return typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function listByUserId(userId) {
    const result = await getPool().request()
        .input("userId", sql.NVarChar(128), userId)
        .query(`${cartSelect}
            WHERE userId = @userId
            ORDER BY createdAt DESC, id DESC
        `);
    return result.recordset;
}

async function addItem(userId, item) {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();

    try {
        const existing = await transaction.request()
            .input("userId", sql.NVarChar(128), userId)
            .input("productId", sql.NVarChar(200), item.productId)
            .query(`
                SELECT id
                FROM dbo.CartItems WITH (UPDLOCK, HOLDLOCK)
                WHERE userId = @userId AND productId = @productId
            `);

        let result;
        if (existing.recordset.length > 0) {
            result = await transaction.request()
                .input("id", sql.UniqueIdentifier, existing.recordset[0].id)
                .input("title", sql.NVarChar(500), item.title || null)
                .input("image", sql.NVarChar(sql.MAX), item.image || null)
                .input("description", sql.NVarChar(sql.MAX), item.desc || null)
                .input("price", sql.Decimal(19, 4), item.price)
                .input("qty", sql.Int, item.qty)
                .query(`
                    UPDATE dbo.CartItems
                    SET title = @title,
                        image = @image,
                        description = @description,
                        price = @price,
                        qty = qty + @qty,
                        updatedAt = SYSUTCDATETIME()
                    OUTPUT ${cartOutput}
                    WHERE id = @id
                `);
        } else {
            result = await transaction.request()
                .input("userId", sql.NVarChar(128), userId)
                .input("productId", sql.NVarChar(200), item.productId)
                .input("title", sql.NVarChar(500), item.title || null)
                .input("image", sql.NVarChar(sql.MAX), item.image || null)
                .input("description", sql.NVarChar(sql.MAX), item.desc || null)
                .input("price", sql.Decimal(19, 4), item.price)
                .input("qty", sql.Int, item.qty)
                .query(`
                    INSERT INTO dbo.CartItems
                        (userId, productId, title, image, description, price, qty)
                    OUTPUT ${cartOutput}
                    VALUES
                        (@userId, @productId, @title, @image, @description, @price, @qty)
                `);
        }

        await transaction.commit();
        return result.recordset[0] || null;
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error("Unable to roll back cart update:", rollbackError);
        }
        throw error;
    }
}

async function findByIdForUser(cartId, userId) {
    if (!isValidCartId(cartId)) return null;

    const result = await getPool().request()
        .input("cartId", sql.UniqueIdentifier, cartId)
        .input("userId", sql.NVarChar(128), userId)
        .query(`${cartSelect}
            WHERE id = @cartId AND userId = @userId
        `);
    return result.recordset[0] || null;
}

async function updateByIdForUser(cartId, userId, updates) {
    if (!isValidCartId(cartId)) return null;

    const fields = {
        title: { column: "title", type: sql.NVarChar(500) },
        image: { column: "image", type: sql.NVarChar(sql.MAX) },
        desc: { column: "description", type: sql.NVarChar(sql.MAX) },
        price: { column: "price", type: sql.Decimal(19, 4) },
        qty: { column: "qty", type: sql.Int },
    };
    const selectedFields = Object.keys(fields).filter((field) =>
        Object.hasOwn(updates, field)
    );
    if (selectedFields.length === 0) return findByIdForUser(cartId, userId);

    const request = getPool().request()
        .input("cartId", sql.UniqueIdentifier, cartId)
        .input("userId", sql.NVarChar(128), userId);
    const assignments = selectedFields.map((field) => {
        const { column, type } = fields[field];
        request.input(field, type, updates[field]);
        return `${column} = @${field}`;
    });

    const result = await request.query(`
        UPDATE dbo.CartItems
        SET ${assignments.join(", ")}, updatedAt = SYSUTCDATETIME()
        OUTPUT ${cartOutput}
        WHERE id = @cartId AND userId = @userId
    `);
    return result.recordset[0] || null;
}

async function deleteByIdForUser(cartId, userId) {
    if (!isValidCartId(cartId)) return false;

    const result = await getPool().request()
        .input("cartId", sql.UniqueIdentifier, cartId)
        .input("userId", sql.NVarChar(128), userId)
        .query(`
            DELETE FROM dbo.CartItems
            OUTPUT deleted.id
            WHERE id = @cartId AND userId = @userId
        `);
    return result.recordset.length > 0;
}

async function clearByUserId(userId) {
    await getPool().request()
        .input("userId", sql.NVarChar(128), userId)
        .query("DELETE FROM dbo.CartItems WHERE userId = @userId");
}

module.exports = {
    listByUserId,
    addItem,
    findByIdForUser,
    updateByIdForUser,
    deleteByIdForUser,
    clearByUserId,
};
