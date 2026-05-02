/*
  SaasMenu — دفع EasyKash
  جدول التحقق من الدفع/الاشتراك اسمه: subscriptionCheckout
  (كود الـ API يستخدم: [subscriptionCheckout] لربط order_id في payments)

  نفّذ مرة واحدة في SSMS إن لم تكن الجداول موجودة.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------- subscriptionCheckout: صف "طلب" للدفع (مثال: اشتراك Pro سنوي) ---------- */
IF OBJECT_ID(N'dbo.subscriptionCheckout', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.subscriptionCheckout (
    id UNIQUEIDENTIFIER NOT NULL,
    user_id INT NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    status NVARCHAR(50) NOT NULL,
    customer_first_name NVARCHAR(200) NULL,
    customer_last_name NVARCHAR(200) NULL,
    customer_phone NVARCHAR(50) NULL,
    voucher_code NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_subscriptionCheckout_created DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_subscriptionCheckout_updated DEFAULT SYSDATETIME(),
    CONSTRAINT PK_subscriptionCheckout PRIMARY KEY (id)
  );
  CREATE INDEX IX_subscriptionCheckout_user_id ON dbo.subscriptionCheckout (user_id);
  CREATE INDEX IX_subscriptionCheckout_status ON dbo.subscriptionCheckout (status);
  PRINT 'Created dbo.subscriptionCheckout';
END
ELSE
  PRINT 'dbo.subscriptionCheckout already exists';
GO

/* ---------- payments: سجل دفع EasyKash (order_id يشير إلى subscriptionCheckout.id) ---------- */
IF OBJECT_ID(N'dbo.payments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.payments (
    id UNIQUEIDENTIFIER NOT NULL,
    order_id UNIQUEIDENTIFIER NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method NVARCHAR(50) NOT NULL,
    payment_status NVARCHAR(50) NOT NULL,
    customer_reference NVARCHAR(500) NULL,
    easykash_ref NVARCHAR(255) NULL,
    easykash_product_code NVARCHAR(255) NULL,
    voucher NVARCHAR(255) NULL,
    payment_provider NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_payments_created DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT PK_payments PRIMARY KEY (id)
  );
  CREATE INDEX IX_payments_order_id ON dbo.payments (order_id);
  CREATE INDEX IX_payments_status ON dbo.payments (payment_status);

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payments_subscriptionCheckout')
    ALTER TABLE dbo.payments
      ADD CONSTRAINT FK_payments_subscriptionCheckout
      FOREIGN KEY (order_id) REFERENCES dbo.subscriptionCheckout (id);

  PRINT 'Created dbo.payments + FK to subscriptionCheckout';
END
ELSE
  PRINT 'dbo.payments already exists (skipped)';
GO
