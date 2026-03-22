-- =============================================================================
-- MIGRATION COMPLETE — Julaba Mobile
-- Nouveau projet Supabase : lpowdjvxikqtorhadhyv
-- Executer dans : Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLES DE BASE
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       text,
    phone_number    text        UNIQUE,
    pin             text,
    role            text        CHECK (role IN ('MERCHANT','PRODUCER','FIELD_AGENT','COOPERATIVE','SUPERVISOR')),
    address         text,
    photo_url       text,
    boutique_name   text,
    agent_id        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
    cooperative_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_profiles_cooperative ON profiles(cooperative_id);

-- 1b. STORES
CREATE TABLE IF NOT EXISTS stores (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        uuid        REFERENCES profiles(id) ON DELETE CASCADE,
    name            text,
    store_type      text,
    owner_role      text,
    status          text        DEFAULT 'ACTIVE',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_owner ON stores(owner_id);

-- 1c. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        uuid        REFERENCES stores(id) ON DELETE CASCADE,
    name            text        NOT NULL,
    price           numeric     DEFAULT 0,
    color           text,
    icon_color      text,
    audio_name      text,
    image_url       text,
    category        text,
    barcode         text,
    description     text,
    delivery_price  numeric,
    zone_livraison  text,
    delai_livraison text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- 1d. STOCK
CREATE TABLE IF NOT EXISTS stock (
    product_id      uuid        PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    store_id        uuid        REFERENCES stores(id) ON DELETE CASCADE,
    quantity        integer     DEFAULT 0,
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_store ON stock(store_id);

-- 1e. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        uuid        REFERENCES stores(id) ON DELETE CASCADE,
    type            text,
    product_id      uuid,
    product_name    text,
    quantity        integer     DEFAULT 1,
    price           numeric     DEFAULT 0,
    client_name     text,
    status          text,
    operator        text,
    client_phone    text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_store ON transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- 1f. ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_store_id  uuid        REFERENCES stores(id) ON DELETE SET NULL,
    seller_store_id uuid        REFERENCES stores(id) ON DELETE SET NULL,
    product_id      uuid,
    product_name    text,
    quantity        integer     DEFAULT 1,
    unit_price      numeric     DEFAULT 0,
    total_amount    numeric     DEFAULT 0,
    status          text        DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACCEPTED','SHIPPED','DELIVERED','CANCELLED')),
    notes           text,
    operator        text,
    payment_mode    text        CHECK (payment_mode IS NULL OR payment_mode IN ('CASH','MOBILE_MONEY','CREDIT')),
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_store_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 1g. DEMANDES D'ENROLEMENT
CREATE TABLE IF NOT EXISTS demandes_enrolement (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
    nom                     text,
    telephone               text,
    type                    text,
    nom_boutique            text,
    adresse                 text,
    photo_url               text,
    statut                  text        DEFAULT 'en_attente'
                            CHECK (statut IN ('en_attente','valide','rejete')),
    motif_rejet             text,
    cooperative_id          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
    cooperative_nom_autre   text,
    affectation_status      text        DEFAULT 'affecte'
                            CHECK (affectation_status IN ('affecte','a_affecter','nouvelle')),
    date_demande            timestamptz DEFAULT now(),
    date_traitement         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_demandes_agent ON demandes_enrolement(agent_id);
CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes_enrolement(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_cooperative ON demandes_enrolement(cooperative_id);

-- 1h. REPORTS (signalements)
CREATE TABLE IF NOT EXISTS reports (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
    member_name     text,
    problem_type    text,
    description     text,
    status          text        DEFAULT 'PENDING',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

-- 1i. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        REFERENCES profiles(id) ON DELETE CASCADE,
    titre           text,
    message         text,
    type            text,
    data            jsonb,
    lu              boolean     DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lu ON notifications(lu);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- 1j. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid,
    user_name       text,
    action          text,
    details         text,
    type            text,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);

-- 1k. CREDITS CLIENTS (carnet de dettes)
CREATE TABLE IF NOT EXISTS credits_clients (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    marchand_id         uuid        REFERENCES profiles(id) ON DELETE CASCADE,
    client_nom          text,
    client_telephone    text,
    montant_du          numeric     DEFAULT 0,
    date_credit         timestamptz DEFAULT now(),
    date_echeance       timestamptz,
    statut              text        DEFAULT 'en_attente'
);

CREATE INDEX IF NOT EXISTS idx_credits_marchand ON credits_clients(marchand_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ACHATS GROUPES (migration_achats_groupes.sql)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achats_groupes (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    cooperative_id      uuid,
    produit_id          uuid,
    producteur_id       uuid,
    nom_produit         text        NOT NULL,
    prix_normal         numeric     DEFAULT 0,
    prix_negocie        numeric,
    quantite_minimum    integer     NOT NULL DEFAULT 1,
    quantite_totale     integer     DEFAULT 0,
    quantite_actuelle   integer     DEFAULT 0,
    statut              text        DEFAULT 'NEGOTIATION'
                        CHECK (statut IN ('NEGOTIATION','OPEN','COMPLETED','CANCELLED')),
    date_limite         date,
    description         text,
    message_coop        text,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS achats_groupes_participants (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    achat_groupe_id     uuid        REFERENCES achats_groupes(id) ON DELETE CASCADE,
    marchand_id         uuid,
    marchand_nom        text,
    quantite            integer     NOT NULL DEFAULT 1,
    date_inscription    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ag_statut     ON achats_groupes(statut);
CREATE INDEX IF NOT EXISTS idx_ag_producteur ON achats_groupes(producteur_id);
CREATE INDEX IF NOT EXISTS idx_ag_coop       ON achats_groupes(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_agp_achat     ON achats_groupes_participants(achat_groupe_id);
CREATE INDEX IF NOT EXISTS idx_agp_marchand  ON achats_groupes_participants(marchand_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REALTIME — Ajouter les tables au systeme de publication temps reel
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE stores;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE stock;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE demandes_enrolement;
ALTER PUBLICATION supabase_realtime ADD TABLE achats_groupes;
ALTER PUBLICATION supabase_realtime ADD TABLE achats_groupes_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — Desactiver pour l'instant (acces via anon key + service_role)
--    L'app utilise phone+PIN, pas Supabase Auth standard.
--    Reactiver et configurer si deploiement en production.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_enrolement         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits_clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE achats_groupes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE achats_groupes_participants ENABLE ROW LEVEL SECURITY;

-- Policies permissives (anon peut tout faire — securite geree cote app)
-- En production, restreindre ces policies selon les roles.

CREATE POLICY "Allow all for anon" ON profiles                    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON stores                      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON products                    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON stock                       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON transactions                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON orders                      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON demandes_enrolement         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON reports                     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON notifications               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON activity_logs               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON credits_clients             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON achats_groupes              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON achats_groupes_participants FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. STORAGE — Bucket pour les images produits
--    A creer manuellement dans Supabase Dashboard → Storage → New bucket :
--      Nom : products
--      Public : OUI
--      Max file size : 5 MB
--      Allowed MIME types : image/jpeg, image/png, image/webp
-- ─────────────────────────────────────────────────────────────────────────────

-- Creer le bucket via SQL (si supporte)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'products',
    'products',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy Storage : lecture publique
CREATE POLICY "Public read products" ON storage.objects
    FOR SELECT USING (bucket_id = 'products');

-- Policy Storage : upload pour tous (anon)
CREATE POLICY "Allow upload products" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'products');

-- Policy Storage : update pour tous (anon)
CREATE POLICY "Allow update products" ON storage.objects
    FOR UPDATE USING (bucket_id = 'products');

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN — Toutes les tables, index, policies et storage sont crees.
-- Prochaine etape : lancer le seed
--   $env:SUPABASE_SERVICE_KEY="<cle>"; node scripts/seed.js
-- ─────────────────────────────────────────────────────────────────────────────
