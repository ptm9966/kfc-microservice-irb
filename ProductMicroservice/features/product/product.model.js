const sql = require("mssql");
const { getPool } = require("../../config/db");

const productSelect = `
    SELECT
        id AS _id,
        image,
        title,
        description AS [desc],
        categories,
        price,
        serve,
        type,
        createdAt,
        updatedAt
    FROM dbo.Products
`;

const productOutput = `
    inserted.id AS _id,
    inserted.image,
    inserted.title,
    inserted.description AS [desc],
    inserted.categories,
    inserted.price,
    inserted.serve,
    inserted.type,
    inserted.createdAt,
    inserted.updatedAt
`;

const productFields = {
    image: { column: "image", type: sql.NVarChar(sql.MAX) },
    title: { column: "title", type: sql.NVarChar(300) },
    desc: { column: "description", type: sql.NVarChar(sql.MAX) },
    categories: { column: "categories", type: sql.NVarChar(128) },
    price: { column: "price", type: sql.Decimal(19, 4) },
    serve: { column: "serve", type: sql.NVarChar(128) },
    type: { column: "type", type: sql.NVarChar(64) },
};

function isValidProductId(id) {
    return typeof id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function list(categories) {
    const request = getPool().request();
    if (categories) {
        request.input("categories", sql.NVarChar(128), categories);
        const result = await request.query(`${productSelect}
            WHERE categories COLLATE Latin1_General_100_BIN2 = @categories
        `);
        return result.recordset;
    }

    const result = await request.query(productSelect);
    return result.recordset;
}

async function searchByTitle(query) {
    const result = await getPool().request()
        .input("query", sql.NVarChar(300), query)
        .query(`${productSelect}
            WHERE CHARINDEX(
                @query COLLATE Latin1_General_100_CI_AS,
                title COLLATE Latin1_General_100_CI_AS
            ) > 0
        `);
    return result.recordset;
}

async function findById(productId) {
    if (!isValidProductId(productId)) return null;

    const result = await getPool().request()
        .input("productId", sql.UniqueIdentifier, productId)
        .query(`${productSelect} WHERE id = @productId`);
    return result.recordset[0] || null;
}

async function findByTitle(title) {
    const result = await getPool().request()
        .input("title", sql.NVarChar(300), title)
        .query(`${productSelect}
            WHERE title COLLATE Latin1_General_100_BIN2 = @title
        `);
    return result.recordset[0] || null;
}

async function create(product) {
    const result = await getPool().request()
        .input("image", sql.NVarChar(sql.MAX), product.image)
        .input("title", sql.NVarChar(300), product.title)
        .input("description", sql.NVarChar(sql.MAX), product.desc)
        .input("categories", sql.NVarChar(128), product.categories)
        .input("price", sql.Decimal(19, 4), product.price)
        .input("serve", sql.NVarChar(128), product.serve)
        .input("type", sql.NVarChar(64), product.type)
        .query(`
            INSERT INTO dbo.Products
                (image, title, description, categories, price, serve, type)
            OUTPUT ${productOutput}
            VALUES
                (@image, @title, @description, @categories, @price, @serve, @type)
        `);
    return result.recordset[0];
}

async function updateById(productId, updates) {
    if (!isValidProductId(productId)) return null;

    const selectedFields = Object.keys(productFields).filter((field) =>
        Object.hasOwn(updates, field)
    );
    if (selectedFields.length === 0) return findById(productId);

    const request = getPool().request()
        .input("productId", sql.UniqueIdentifier, productId);
    const assignments = selectedFields.map((field) => {
        const { column, type } = productFields[field];
        request.input(field, type, updates[field]);
        return `${column} = @${field}`;
    });

    const result = await request.query(`
        UPDATE dbo.Products
        SET ${assignments.join(", ")}, updatedAt = SYSUTCDATETIME()
        OUTPUT ${productOutput}
        WHERE id = @productId
    `);
    return result.recordset[0] || null;
}

async function deleteById(productId) {
    if (!isValidProductId(productId)) return false;

    const result = await getPool().request()
        .input("productId", sql.UniqueIdentifier, productId)
        .query(`
            DELETE FROM dbo.Products
            OUTPUT deleted.id
            WHERE id = @productId
        `);
    return result.recordset.length > 0;
}

module.exports = { list, searchByTitle, findById, findByTitle, create, updateById, deleteById };
