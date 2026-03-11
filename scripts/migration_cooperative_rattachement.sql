-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : Rattachement Coopérative — Inclusion Marchand
-- Ajoute le lien membre ↔ coopérative dans les profils et les enrôlements
-- Exécuter dans l'éditeur SQL Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajouter cooperative_id dans profiles
--    Chaque membre (marchand/producteur) est rattaché à une coopérative
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_cooperative ON profiles(cooperative_id);

-- 2. Ajouter les colonnes de rattachement dans demandes_enrolement
ALTER TABLE demandes_enrolement
  ADD COLUMN IF NOT EXISTS cooperative_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cooperative_nom_autre  text,
  ADD COLUMN IF NOT EXISTS affectation_status    text DEFAULT 'affecte'
    CHECK (affectation_status IN ('affecte', 'a_affecter', 'nouvelle'));

CREATE INDEX IF NOT EXISTS idx_demandes_cooperative ON demandes_enrolement(cooperative_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Résultat :
--   profiles.cooperative_id        → UUID du profil coopérative de rattachement
--   demandes_enrolement.cooperative_id       → coopérative sélectionnée par l'agent
--   demandes_enrolement.cooperative_nom_autre → nom saisi si coopérative inconnue
--   demandes_enrolement.affectation_status   → 'affecte'|'a_affecter'|'nouvelle'
-- ─────────────────────────────────────────────────────────────────────────────
