IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_Users_Id DEFAULT NEWSEQUENTIALID(),
        name NVARCHAR(200) NOT NULL,
        email NVARCHAR(320) NOT NULL,
        mobile NVARCHAR(32) NOT NULL,
        passwordHash CHAR(128) NOT NULL,
        passwordSalt CHAR(32) NOT NULL,
        createdAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_Users PRIMARY KEY (id),
        CONSTRAINT UQ_Users_Email UNIQUE (email),
        CONSTRAINT UQ_Users_Mobile UNIQUE (mobile)
    );
END;
