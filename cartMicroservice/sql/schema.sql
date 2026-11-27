IF OBJECT_ID(N'dbo.CartItems', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CartItems (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_CartItems_Id DEFAULT NEWSEQUENTIALID(),
        userId NVARCHAR(128) NOT NULL,
        productId NVARCHAR(200) NOT NULL,
        image NVARCHAR(MAX) NULL,
        title NVARCHAR(500) NULL,
        description NVARCHAR(MAX) NULL,
        price DECIMAL(19, 4) NOT NULL,
        qty INT NOT NULL,
        createdAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_CartItems_CreatedAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_CartItems_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_CartItems PRIMARY KEY (id),
        CONSTRAINT UQ_CartItems_User_Product UNIQUE (userId, productId),
        CONSTRAINT CK_CartItems_Qty_Positive CHECK (qty > 0)
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_CartItems_UserId_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.CartItems')
)
BEGIN
    CREATE INDEX IX_CartItems_UserId_CreatedAt
        ON dbo.CartItems (userId, createdAt DESC);
END;
