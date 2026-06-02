-- Backfill paymentStatus for free plans and admin-granted subscriptions (no EasyKash match).
-- Run once on SaasMenu DB after deploying backend changes.

-- Free plan / free billing cycle
UPDATE s
SET
  paymentStatus = N'completed',
  paidAt = COALESCE(s.paidAt, s.startDate, s.createdAt, GETDATE()),
  amount = COALESCE(s.amount, 0)
FROM Subscriptions s
INNER JOIN Plans p ON s.planId = p.id
WHERE (
    LOWER(LTRIM(RTRIM(p.name))) = N'free'
    OR LOWER(LTRIM(RTRIM(ISNULL(s.billingCycle, N'')))) = N'free'
  )
  AND ISNULL(s.paymentStatus, N'') <> N'completed';

-- Admin-granted Pro (active, no completed EasyKash payment near subscription start)
UPDATE s
SET
  paymentStatus = N'completed',
  paidAt = COALESCE(s.paidAt, s.startDate, s.createdAt, GETDATE()),
  amount = COALESCE(s.amount, 0)
FROM Subscriptions s
INNER JOIN Plans p ON s.planId = p.id
WHERE LOWER(LTRIM(RTRIM(p.name))) = N'pro'
  AND ISNULL(s.paymentStatus, N'') <> N'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM [subscriptionCheckout] o
    INNER JOIN payments pay ON pay.order_id = o.id
      AND pay.payment_method = N'easykash'
      AND pay.payment_status = N'completed'
    WHERE o.user_id = s.userId
      AND ABS(DATEDIFF(hour, ISNULL(pay.updated_at, pay.created_at), s.startDate)) <= 168
  );

GO
