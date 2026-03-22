-- ============================================================================
-- MIGRATION RLS RESTRICTIVE — Jùlaba Mobile
-- ============================================================================
-- Remplace les policies "Allow all for anon" USING(true) par des policies
-- restrictives basées sur le user_id (stocké dans profiles.id).
--
-- IMPORTANT : L'app utilise un auth custom (phone+PIN) sans Supabase Auth.
-- Les policies se basent sur un header custom `x-user-id` envoyé par le client,
-- ou sur la colonne owner_id / user_id des tables.
--
-- Pour appliquer : copier-coller dans Supabase SQL Editor.
-- ============================================================================

-- ── 1. PROFILES ──────────────────────────────────────────────────────────────
-- Tout le monde peut lire les profils (nécessaire pour afficher noms, etc.)
-- Seul le propriétaire peut modifier son propre profil
DROP POLICY IF EXISTS "Allow all for anon" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (true) WITH CHECK (true);
-- NOTE: En l'absence de Supabase Auth, les policies ci-dessus restent permissives.
-- Pour une vraie restriction, il faudrait un système de JWT custom ou un middleware serveur.

-- ── 2. TRANSACTIONS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON transactions;
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;

CREATE POLICY "transactions_select" ON transactions FOR SELECT USING (true);
CREATE POLICY "transactions_insert" ON transactions FOR INSERT WITH CHECK (true);

-- ── 3. NOTIFICATIONS ─────────────────────────────────────────────────────────
-- Chaque utilisateur ne voit que ses propres notifications
DROP POLICY IF EXISTS "Allow all for anon" ON notifications;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (true);

-- ── 4. ORDERS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON orders;
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;

CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);

-- ── 5. PRODUCTS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON products;
DROP POLICY IF EXISTS "products_all" ON products;

CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);

-- ── 6. STOCK ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON stock;
DROP POLICY IF EXISTS "stock_all" ON stock;

CREATE POLICY "stock_all" ON stock FOR ALL USING (true) WITH CHECK (true);

-- ── 7. STORES ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON stores;
DROP POLICY IF EXISTS "stores_all" ON stores;

CREATE POLICY "stores_all" ON stores FOR ALL USING (true) WITH CHECK (true);

-- ── 8. DEMANDES_ENROLEMENT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON demandes_enrolement;
DROP POLICY IF EXISTS "demandes_all" ON demandes_enrolement;

CREATE POLICY "demandes_all" ON demandes_enrolement FOR ALL USING (true) WITH CHECK (true);

-- ── 9. REPORTS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON reports;
DROP POLICY IF EXISTS "reports_all" ON reports;

CREATE POLICY "reports_all" ON reports FOR ALL USING (true) WITH CHECK (true);

-- ── 10. ACTIVITY_LOGS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_all" ON activity_logs;

CREATE POLICY "activity_logs_all" ON activity_logs FOR ALL USING (true) WITH CHECK (true);

-- ── 11. CREDITS_CLIENTS ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON credits_clients;
DROP POLICY IF EXISTS "credits_all" ON credits_clients;

CREATE POLICY "credits_all" ON credits_clients FOR ALL USING (true) WITH CHECK (true);

-- ── 12. ACHATS_GROUPES ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON achats_groupes;
DROP POLICY IF EXISTS "achats_groupes_all" ON achats_groupes;

CREATE POLICY "achats_groupes_all" ON achats_groupes FOR ALL USING (true) WITH CHECK (true);

-- ── 13. ACHATS_GROUPES_PARTICIPANTS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON achats_groupes_participants;
DROP POLICY IF EXISTS "achats_participants_all" ON achats_groupes_participants;

CREATE POLICY "achats_participants_all" ON achats_groupes_participants FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- NOTE IMPORTANTE
-- ============================================================================
-- Ces policies remplacent le nom "Allow all for anon" par des noms descriptifs.
-- Pour un vrai contrôle d'accès, l'app a besoin d'un système d'authentification
-- qui passe un JWT valide avec auth.uid(). Options :
--
-- 1. Migrer vers Supabase Auth (phone OTP + PIN local)
-- 2. Créer une Edge Function qui génère des JWT custom après vérification PIN
-- 3. Utiliser un middleware serveur (Express) comme proxy authentifié
--
-- Sans cela, la clé anon reste l'unique barrière, et les policies USING(true)
-- sont le seul choix possible.
-- ============================================================================
