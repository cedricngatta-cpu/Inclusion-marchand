-- Migration Mobile Money — Inclusion Marchand
-- Ajouter les colonnes operator et client_phone à transactions

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operator text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_phone text;

-- Ajouter operator à orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS operator text;

-- Commentaires sur les valeurs attendues
-- transactions.operator  : 'ORANGE' | 'MTN' | 'WAVE' | 'MOOV' (null si status != 'MOMO')
-- transactions.client_phone : numéro optionnel du client Mobile Money
-- orders.operator        : 'ORANGE' | 'MTN' | 'WAVE' | 'MOOV' (null si payment_mode != 'MOBILE_MONEY')
