-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : Achat Groupé v2 — Flux en 2 phases (Négociation + Ouverture)
-- Exécuter dans l'éditeur SQL Supabase
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS achats_groupes_participants CASCADE;
DROP TABLE IF EXISTS achats_groupes CASCADE;

-- Table principale
CREATE TABLE achats_groupes (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    cooperative_id      uuid,
    produit_id          uuid,
    producteur_id       uuid,
    nom_produit         text        NOT NULL,
    prix_normal         numeric     DEFAULT 0,
    prix_negocie        numeric,                    -- null pendant la phase NEGOTIATION
    quantite_minimum    integer     NOT NULL DEFAULT 1,
    quantite_totale     integer     DEFAULT 0,
    quantite_actuelle   integer     DEFAULT 0,
    statut              text        DEFAULT 'NEGOTIATION'
                        CHECK (statut IN ('NEGOTIATION','OPEN','COMPLETED','CANCELLED')),
    date_limite         date,
    description         text,
    message_coop        text,                       -- message de la coopérative au producteur
    created_at          timestamptz DEFAULT now()
);

-- Table des participants
CREATE TABLE achats_groupes_participants (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    achat_groupe_id     uuid        REFERENCES achats_groupes(id) ON DELETE CASCADE,
    marchand_id         uuid,
    marchand_nom        text,
    quantite            integer     NOT NULL DEFAULT 1,
    date_inscription    timestamptz DEFAULT now()
);

-- Index
CREATE INDEX idx_ag_statut     ON achats_groupes(statut);
CREATE INDEX idx_ag_producteur ON achats_groupes(producteur_id);
CREATE INDEX idx_ag_coop       ON achats_groupes(cooperative_id);
CREATE INDEX idx_agp_achat     ON achats_groupes_participants(achat_groupe_id);
CREATE INDEX idx_agp_marchand  ON achats_groupes_participants(marchand_id);

-- Activer Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE achats_groupes;
ALTER PUBLICATION supabase_realtime ADD TABLE achats_groupes_participants;
