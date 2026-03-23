-- Migration : ajouter la colonne source aux transactions
-- Permet de savoir si la vente a ete faite manuellement, par commande vocale, ou en mode offline
-- Valeurs : 'manual' (defaut), 'voice', 'voice_offline'

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
