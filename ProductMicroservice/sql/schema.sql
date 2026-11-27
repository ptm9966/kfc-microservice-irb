IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Products (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_Products_Id DEFAULT NEWSEQUENTIALID(),
        image NVARCHAR(MAX) NOT NULL,
        title NVARCHAR(300) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        categories NVARCHAR(128) NOT NULL,
        price DECIMAL(19, 4) NOT NULL,
        serve NVARCHAR(128) NOT NULL,
        type NVARCHAR(64) NOT NULL,
        createdAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Products PRIMARY KEY (id)
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Products_Category'
      AND object_id = OBJECT_ID(N'dbo.Products')
)
BEGIN
    CREATE INDEX IX_Products_Category
        ON dbo.Products (categories);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Products_Title'
      AND object_id = OBJECT_ID(N'dbo.Products')
)
BEGIN
    CREATE INDEX IX_Products_Title
        ON dbo.Products (title);
END;
