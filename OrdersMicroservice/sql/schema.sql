IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Orders (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_Orders_Id DEFAULT NEWSEQUENTIALID(),
        orderNo NVARCHAR(64) NOT NULL,
        userId NVARCHAR(128) NOT NULL,
        userName NVARCHAR(200) NOT NULL,
        userMobile NVARCHAR(32) NULL,
        totalItems DECIMAL(18, 4) NOT NULL,
        totalPrice DECIMAL(19, 4) NOT NULL,
        paymentMethod NVARCHAR(64) NOT NULL,
        status NVARCHAR(64) NOT NULL,
        createdAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Orders_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Orders PRIMARY KEY (id),
        CONSTRAINT UQ_Orders_OrderNo UNIQUE (orderNo)
    );
END;

IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrderItems (
        orderId UNIQUEIDENTIFIER NOT NULL,
        lineNumber INT NOT NULL,
        productId NVARCHAR(200) NULL,
        title NVARCHAR(500) NULL,
        image NVARCHAR(MAX) NULL,
        description NVARCHAR(MAX) NULL,
        price DECIMAL(19, 4) NOT NULL,
        qty DECIMAL(18, 4) NOT NULL,
        CONSTRAINT PK_OrderItems PRIMARY KEY (orderId, lineNumber),
        CONSTRAINT FK_OrderItems_Orders
            FOREIGN KEY (orderId) REFERENCES dbo.Orders(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Orders_UserId_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.Orders')
)
BEGIN
    CREATE INDEX IX_Orders_UserId_CreatedAt
        ON dbo.Orders (userId, createdAt DESC);
END;
