const crypto = require("node:crypto");
const sql = require("mssql");
const { getPool } = require("../../config/db");

const orderSelect = `
    SELECT
        o.id AS _id,
        o.orderNo,
        o.userId,
        o.userName,
        o.userMobile,
        o.totalItems,
        o.totalPrice,
        o.paymentMethod,
        o.status,
        o.createdAt,
        o.updatedAt,
        i.lineNumber,
        i.productId,
        i.title,
        i.image,
        i.description AS [desc],
        i.price,
        i.qty
    FROM dbo.Orders o
    LEFT JOIN dbo.OrderItems i ON i.orderId = o.id
`;

function isValidOrderId(id) {
    return typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function mapOrders(rows) {
    const orders = new Map();
    for (const row of rows) {
        let order = orders.get(row._id);
        if (!order) {
            order = {
                _id: row._id,
                orderNo: row.orderNo,
                userId: row.userId,
                userName: row.userName,
                userMobile: row.userMobile,
                totalItems: row.totalItems,
                totalPrice: row.totalPrice,
                paymentMethod: row.paymentMethod,
                status: row.status,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                items: [],
            };
            orders.set(row._id, order);
        }

        if (row.lineNumber !== null) {
            order.items.push({
                productId: row.productId,
                title: row.title,
                image: row.image,
                desc: row.desc,
                price: row.price,
                qty: row.qty,
            });
        }
    }
    return [...orders.values()];
}

async function listByUserId(userId) {
    const result = await getPool().request()
        .input("userId", sql.NVarChar(128), userId)
        .query(`${orderSelect}
            WHERE o.userId = @userId
            ORDER BY o.createdAt DESC, i.lineNumber ASC
        `);
    return mapOrders(result.recordset);
}

async function findByIdForUser(orderId, userId) {
    if (!isValidOrderId(orderId)) return null;

    const result = await getPool().request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .input("userId", sql.NVarChar(128), userId)
        .query(`${orderSelect}
            WHERE o.id = @orderId AND o.userId = @userId
            ORDER BY i.lineNumber ASC
        `);
    return mapOrders(result.recordset)[0] || null;
}

async function updateStatus(orderId, status) {
    if (!isValidOrderId(orderId)) return null;

    const result = await getPool().request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .input("status", sql.NVarChar(64), status)
        .query(`
            UPDATE dbo.Orders
            SET status = @status, updatedAt = SYSUTCDATETIME()
            WHERE id = @orderId;
        `);
    if (result.rowsAffected[0] === 0) return null;

    const order = await getById(orderId);
    return order;
}

async function getById(orderId) {
    const result = await getPool().request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .query(`${orderSelect}
            WHERE o.id = @orderId
            ORDER BY i.lineNumber ASC
        `);
    return mapOrders(result.recordset)[0] || null;
}

async function create(order) {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();

    let orderId;
    try {
        const orderNo = order.orderNo || `KGF-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
        const result = await transaction.request()
            .input("orderNo", sql.NVarChar(64), orderNo)
            .input("userId", sql.NVarChar(128), order.userId)
            .input("userName", sql.NVarChar(200), order.userName)
            .input("userMobile", sql.NVarChar(32), order.userMobile || null)
            .input("totalItems", sql.Decimal(18, 4), order.totalItems)
            .input("totalPrice", sql.Decimal(19, 4), order.totalPrice)
            .input("paymentMethod", sql.NVarChar(64), order.paymentMethod)
            .input("status", sql.NVarChar(64), order.status)
            .query(`
                INSERT INTO dbo.Orders
                    (orderNo, userId, userName, userMobile, totalItems,
                     totalPrice, paymentMethod, status)
                OUTPUT inserted.id AS id
                VALUES
                    (@orderNo, @userId, @userName, @userMobile, @totalItems,
                     @totalPrice, @paymentMethod, @status)
            `);
        orderId = result.recordset[0].id;

        for (const [lineNumber, item] of order.items.entries()) {
            await transaction.request()
                .input("orderId", sql.UniqueIdentifier, orderId)
                .input("lineNumber", sql.Int, lineNumber)
                .input("productId", sql.NVarChar(200), item.productId || null)
                .input("title", sql.NVarChar(500), item.title || null)
                .input("image", sql.NVarChar(sql.MAX), item.image || null)
                .input("description", sql.NVarChar(sql.MAX), item.desc || null)
                .input("price", sql.Decimal(19, 4), item.price)
                .input("qty", sql.Decimal(18, 4), item.qty)
                .query(`
                    INSERT INTO dbo.OrderItems
                        (orderId, lineNumber, productId, title, image, description, price, qty)
                    VALUES
                        (@orderId, @lineNumber, @productId, @title, @image, @description, @price, @qty)
                `);
        }

        await transaction.commit();
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error("Unable to roll back order creation:", rollbackError);
        }
        throw error;
    }

    return getById(orderId);
}

module.exports = { listByUserId, findByIdForUser, updateStatus, create };
