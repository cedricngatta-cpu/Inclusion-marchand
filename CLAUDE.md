# CLAUDE.md — Guide complet Inclusion Marchand Mobile

## Projet
Application mobile Android React Native / Expo SDK 54 pour l'inclusion économique des commerçants informels en Afrique.
Backend : Supabase (PostgreSQL) + Socket.io (realtime)
IA vocale : Groq API (Llama 3.3 + Whisper) + expo-speech
Objectif : Build APK via EAS Build pour démo investisseurs
Cible : Commerçants peu alphabétisés, marchés vivriers, zones à connexion instable

## SCRIPT DE SIMULATION
Le script `scripts/simulate.js` simule 5 rôles en 7 actes (enrôlement, publication, commandes, livraison, ventes, achat groupé, signalement).
**L'admin reçoit une notification pour CHAQUE action** via `notifyAdmin()` après chaque INSERT/UPDATE.
Usage : `$env:SUPABASE_SERVICE_KEY="clé"; node scripts/simulate.js`
Pré-requis : lancer le seed (`node scripts/seed.js`) avant la simulation.

---

## LES 5 RÔLES

### Marchand (commerçant)
- Enregistrer des ventes (scanner + vocal)
- Gérer son stock
- Consulter ses revenus et bilan
- Commander des produits via le Marché Virtuel
- Rejoindre des achats groupés (prix négocié par la coopérative)
- Carnet de dettes clients
- Accéder aux services financiers (microcrédit, assurance, score de crédit)

### Producteur
- Publier des récoltes/produits sur le Marché Virtuel
- Recevoir et traiter les commandes des marchands
- Gérer ses livraisons (statut en temps réel)
- Voir et modifier ses produits publiés
- Suivre ses revenus

### Coopérative (tour de contrôle)
- **CONFIRMER/REJETER les membres inscrits par les agents** (vérification d'identité, pas acceptation de candidature)
  - Écran "Validations" (ex "Demandes") — onglets : "À vérifier" / "Confirmés" / "Rejetés"
  - Boutons : "CONFIRMER CE MEMBRE" / "CE N'EST PAS UN DE NOS MEMBRES"
  - Notification reçue : "Nouveau membre à vérifier" avec message "L'agent [nom] a inscrit [membre] ([type]). Vérifiez que cette personne est bien un de vos membres."
- Superviser les performances de tous les membres
- Créer et gérer les achats groupés (prix négocié, seuil minimum, deadline)
- Finaliser les achats groupés → crée les commandes individuelles pour chaque marchand participant
- Analyser les tendances du marché (stats par boutique, realtime)
- Gérer la communauté des membres (producteurs uniquement dans la liste membres)
- Voir le détail de chaque producteur : catalogue, commandes B2B, revenus

### Agent terrain
- Enrôler les marchands et producteurs sur le terrain
- Suivre son secteur (actifs/inactifs)
- Signaler les problèmes de conformité
- Voir ses statistiques d'enrôlement

### Administrateur (super admin)
- Voir et gérer TOUS les utilisateurs (avec répartition par rôle)
- Voir TOUTES les transactions du réseau
- Voir TOUS les produits (stock marchands + marché virtuel)
- Voir TOUTES les commandes B2B
- Gérer les signalements de conformité
- Statistiques globales avec graphiques
- Fil d'activité en temps réel
- Réinitialiser PIN, désactiver comptes, changer rôles

---

## FLUX MÉTIER COMPLET

1. Agent enrôle un marchand/producteur sur le terrain en choisissant sa coopérative (select / pas de coop / autre non listée)
2. Coopérative **confirme que la personne est bien un de ses membres** (vérification d'identité) → compte créé avec `cooperative_id` lié. Si la coopérative clique "CE N'EST PAS UN DE NOS MEMBRES", la demande est rejetée.
3. Producteur publie une récolte sur le Marché Virtuel (avec photo, prix, prix livraison, livreur)
4. Marchand voit le produit, consulte les infos producteur/livreur, passe commande
5. Producteur accepte la commande
6. Producteur marque la livraison (ACCEPTED → SHIPPED). Il ne peut PAS marquer "Livrée".
7. **Le MARCHAND confirme la réception** (SHIPPED → DELIVERED) depuis son écran "Mes Commandes" — c'est lui qui dit "j'ai reçu". Stock mis à jour automatiquement à la confirmation.
8. Marchand vend au client final (scanner ou vocal)
9. Tout est supervisé par la Coopérative et l'Admin en temps réel

### Rattachement Coopérative
- Chaque membre (marchand/producteur) est rattaché à une coopérative lors de l'enrôlement
- La coopérative ne voit que ses propres membres et demandes d'enrôlement (filtre `cooperative_id`)
- L'admin voit tout le monde avec la colonne "Coopérative" affichée
- Si le membre n'a pas de coopérative → `affectation_status='a_affecter'`, notif envoyée à la première coopérative du système
- Si la coopérative n'est pas dans le système → `affectation_status='nouvelle'`, notif envoyée à tous les admins

### Flux Achat Groupé (2 phases)
- **Phase 1 NEGOTIATION** : Coopérative crée la demande (produit, quantité cible, quantité min, deadline, message) → Socket.io `demande-prix-groupe` → Producteur reçoit et propose son prix → Socket.io `prix-groupe-propose`
- **Phase 2 OPEN** : Coopérative accepte le prix → statut='OPEN' → Socket.io `prix-groupe-accepte` → Marchands peuvent rejoindre
- **COMPLETED** : Coopérative finalise → commandes individuelles créées pour chaque participant
- **CANCELLED** : Coopérative annule ou Producteur refuse
- Colonne `prix_negocie` nullable : null pendant NEGOTIATION, rempli après proposition du producteur

---

## RÈGLES DE DESIGN OBLIGATOIRES

### 1. PAS DE CERCLES
- AUCUN élément circulaire sauf le header vert
- Tous les borderRadius : maximum 10-12px
- SEULE EXCEPTION : coins arrondis en bas du header vert

### 2. Header vert — Design de référence
- Fond vert #059669
- Icônes en haut dans des carrés blancs arrondis (borderRadius: 10)
- Bouton retour sur écrans secondaires : flèche blanche dans carré blanc arrondi
- Tous les écrans suivent le MÊME style de header

### 3. Espacement
- Contenu ne chevauche JAMAIS le header
- Minimum 20px entre header et premier élément
- Minimum 15px entre chaque carte/section
- Tout dans un ScrollView

### 4. Collapsible Header (dashboard marchand uniquement)
- Header animé avec react-native-reanimated
- Au scroll : textes secondaires disparaissent, solde remonte sur la ligne des icônes
- 60fps, UI thread, worklets

### 5. Navigation
- PAS de tab bar en bas
- Stack Navigator uniquement
- Navigation via grille d'icônes + bouton retour système Android
- Gestes retour natifs Android activés

### 6. Grille Admin
- 2 COLONNES (pas 3 ni 4)
- Largeur carte = (screenWidth - 44) / 2
- Texte complet sur une ligne, numberOfLines={1}

---

## SCANNER

### Design
- PAS de caméra plein écran
- Zone rectangulaire au centre + overlay sombre
- 4 marqueurs verts + ligne rouge/jaune qui défile
- Bip sonore (expo-av) ou vibration au scan

### Utilisé dans
1. Écran Scanner (dashboard)
2. Écran Vendre (scanner → panier → valider)
3. Formulaire Nouveau Produit (enregistrer code-barres)

### Types supportés
EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code

---

## PHOTOS PRODUITS

- expo-image-picker (caméra ou galerie)
- Upload dans Supabase Storage
- Affichées dans : vendre, stock, marché virtuel, mes produits
- Si pas de photo : initiale du produit sur fond coloré

---

## ASSISTANT VOCAL HYBRIDE

### Mode local (offline)
- Commandes par mots-clés → navigation directe
- Commandes différentes par rôle
- TTS confirmation + vibration

### Mode IA (online via Groq)
- STT : expo-av + Groq Whisper
- Chat : Groq Llama 3.3 70B
- TTS : expo-speech (fr-FR)
- Conversation continue avec historique
- Données Supabase réelles dans le prompt (stock, ventes, commandes...)
- Données DIFFÉRENTES selon le rôle
- Actions exécutables après confirmation vocale (TOUTES les actions métier)
- Message d'accueil personnalisé avec résumé d'activité
- Intelligence proactive (alertes stock bas, suggestions)

### Actions vocales exécutables par rôle

**MARCHAND** : vendre, vendre_multiple, stock_ajout, stock_nouveau, commander, dette_ajout, dette_payee, navigate
**PRODUCTEUR** : publier, produit_modifier, commande_accepter, commande_refuser, livraison_statut, navigate
**AGENT** : enroler (avec extraction du nom de coopérative depuis la phrase vocale ex: "Inscris Bakary, coopérative AGRI-CI"), signaler, navigate
**COOPÉRATIVE** : enrolement_valider, enrolement_rejeter, achat_groupe, navigate
**ADMIN** : compte_desactiver, pin_reset, changer_role, navigate

### Architecture de l'assistant vocal

- `src/lib/groqAI.ts` : Groq API + fetchRoleContext + buildSystemPrompt + parseAction
- `src/lib/voiceAssistant.ts` : audio (enregistrement/TTS) + executeVoiceAction (toutes les actions Supabase)
- `src/components/VoiceModal.tsx` : UI du modal (conversation, confirmation, micro)
- Format ACTION:: : `ACTION::{"type":"vendre","details":{...}}` — parsé par parseAction()
- Confirmation : boutons Confirmer/Annuler + voix "oui"/"non"
- Recherche ILIKE pour noms de produits/profils (insensible à la casse et aux pluriels)

### Bouton micro
- Carré arrondi 56x56, vert #059669, borderRadius: 10
- Position absolute, bottom: 30, right: 20
- Présent sur TOUS les écrans

---

## NOTIFICATIONS

- Vraies notifications (pas de bouton test)
- Stockées dans Supabase (table notifications) avec user_id spécifique
- Persistantes après déconnexion
- Cliquables → modal de détail complet + bouton VOIR → navigation
- Badge non lu (vert) sur l'icône cloche
- Types : commande, commande_refusee, livraison, enrolement, signalement, marche, achat_groupe, vente
- Couleurs : commande=bleu, livraison=vert, enrolement=orange, signalement=rouge, marche=violet, achat_groupe=cyan

### Règle absolue
Chaque notification va UNIQUEMENT au user_id concerné. Pas de broadcast inutile.

### Matrice par rôle

**MARCHAND reçoit :**
- commande-acceptee → "[Producteur] a accepté votre commande" → /(tabs)/marche
- commande-refusee → "Commande refusée" avec raison → /(tabs)/marche
- livraison-en-cours → "Livraison en route" → /(tabs)/marche
- livraison-terminee → "Livraison reçue ✓ — X produit ajoutés au stock" → /(tabs)/stock
- nouveau-produit-marche → "Nouveau produit disponible" → /(tabs)/marche
- achat-groupe-cree → "Achat groupé ouvert — [produit] à [prix]F" → /(tabs)/marche

**PRODUCTEUR reçoit :**
- nouvelle-commande → "Nouvelle commande — [Marchand] veut X [produit]" → /producteur/commandes
- demande-prix-groupe → "Demande de prix groupé — coopérative [nom]" → /producteur/commandes
- prix-groupe-accepte → "Prix groupé accepté ✓" → /producteur/commandes
- achat-groupe-rejoint → "Nouveau participant — [Marchand]" → /producteur/commandes

**AGENT reçoit :**
- enrolement-valide → "Inscription validée ✓ — [Nom] (type) par [coop]" → /agent/activites
- enrolement-rejete → "Inscription refusée — motif + invitation à corriger" → /agent/activites

**COOPÉRATIVE reçoit :**
- nouvel-enrolement → "Nouvelle demande d'inscription" → /cooperative/demandes (ciblé cooperative_id)
- nouvelle-commande → "Commande B2B dans le réseau" → /cooperative/achats
- prix-groupe-propose → "Prix groupé reçu — [Producteur] propose [prix]F" → /cooperative/achats
- signalement-conformite → "Nouveau signalement" → /cooperative/membres
- achat-groupe-rejoint → "Participation achat groupé — X/Y participants" → /cooperative/achats

**ADMIN reçoit tout + :**
- nouvelle-vente → "Vente enregistrée — [Marchand] a vendu pour [total]F" → /admin/transactions
- cooperative-inconnue → "Coopérative non listée" → /admin/utilisateurs

---

## PAIEMENTS

### Modes
- Espèces (status = 'PAYÉ')
- Mobile Money (status = 'MOMO' + colonne `operator`) — **IMPLÉMENTÉ**
- Crédit client / Dette (status = 'DETTE')

### Opérateurs Mobile Money
- Orange Money (#FF6600), MTN MoMo (#FFCC00 / texte #996600), Wave (#1DC4E9 / texte #0A8FA8), Moov Money (#0066CC)
- Colonne `operator` dans transactions : 'ORANGE' | 'MTN' | 'WAVE' | 'MOOV' (null si pas MOMO)
- Colonne `client_phone` dans transactions : numéro optionnel du client

### Flux paiement Mobile Money
Les paiements se font en Espèces ou Mobile Money (Orange Money, MTN MoMo, Wave, Moov Money).
Chaque transaction enregistre le mode de paiement (status) et l'opérateur (operator).
1. Vente au client final : sélection opérateur inline dans le panier de vendre.tsx
2. Commande B2B : sélection opérateur dans le modal de confirmation de marche.tsx
3. Bilan : répartition MOMO par opérateur avec barres de progression
4. Finance : section Mobile Money avec total du jour + breakdown opérateurs
5. Admin : filtre "Mobile Money" dans transactions + badge opérateur coloré + stat MOMO dashboard

### Migration SQL requise (exécuter dans Supabase)
- `scripts/migration_mobile_money.sql` : ADD COLUMN operator TEXT à transactions et orders, ADD COLUMN client_phone TEXT à transactions

---

## REALTIME SOCKET.IO

### Flux : TOUJOURS Supabase d'abord, Socket.io ensuite
1. INSERT/UPDATE dans Supabase
2. PUIS émettre l'event Socket.io
3. Au chargement → lire depuis Supabase
4. Socket.io = trigger de refresh, pas source de données

### Events
- nouvel-enrolement, enrolement-valide/rejete
- nouveau-produit-marche, produit-modifie, produit-supprime
- nouvelle-commande, commande-acceptee/refusee
- livraison-en-cours, livraison-terminee
- nouvelle-vente
- achat-groupe-cree, achat-groupe-rejoint, achat-groupe-finalise
- signalement-conformite
- stats-reseau-update

### Rooms
- Chaque utilisateur : room = user_id
- Par rôle : "marchands", "producteurs", "agents", "cooperative", "admin"

---

## RAFRAÎCHISSEMENT DES DONNÉES

- useFocusEffect sur TOUS les écrans avec données dynamiques
- Socket.io events → trigger fetchData() depuis Supabase
- Pas de données volatiles en mémoire uniquement

---

## SÉCURITÉ

- Auth : téléphone + PIN (pas Supabase Auth standard)
- Déconnexion : router.replace('/login') + clear AsyncStorage + clear stack
- Bouton retour Android sur login → quitte l'app (BackHandler.exitApp())
- Verrouillage auto après 60s d'inactivité → PIN requis

---

## OFFLINE-FIRST

- Stockage local : AsyncStorage + expo-sqlite
- File de synchronisation quand internet revient
- L'app doit fonctionner sans connexion pour les opérations basiques

---

## TABLES SUPABASE

- profiles (id, full_name, phone_number, pin, role, address, photo_url, boutique_name, agent_id, created_at)
  → Colonnes exactes : **full_name** (pas `name`), **phone_number** (pas `phone`)
  → Rôles DB (uppercase) : MERCHANT, PRODUCER, FIELD_AGENT, COOPERATIVE, SUPERVISOR
- stores (id, owner_id, name, store_type, owner_role, status, created_at)
- products (id, store_id, name, price, color, icon_color, audio_name, category, barcode, image_url, description, delivery_price, created_at)
- stock (id, store_id, product_id, quantity, updated_at)
- transactions (id, store_id, product_id, product_name, type, status, price, quantity, client_name, created_at)
  → Colonne montant = **price** (pas `total_amount`)
- orders (id, buyer_store_id, seller_store_id, product_id, product_name, quantity, unit_price, total_amount, status, notes, created_at)
  → Statuts valides : PENDING, ACCEPTED, SHIPPED, DELIVERED, CANCELLED (pas SHIPPING ni REJECTED)
- demandes_enrolement (id, agent_id, nom, telephone, type, nom_boutique, adresse, photo_url, statut, motif_rejet, date_demande, date_traitement)
  → statut values : en_attente, valide, rejete
- reports (id, agent_id, target_id, reason, details, status, created_at)
- notifications (id, user_id, titre, message, type, data jsonb, lu, created_at)
- activity_logs (id, user_id, user_name, action, details, type, created_at)
- credits_clients (id, marchand_id, client_nom, client_telephone, montant_du, date_credit, date_echeance, statut)
- achats_groupes (id, cooperative_id, produit_id, producteur_id, nom_produit, prix_normal, prix_negocie, quantite_minimum, quantite_totale, quantite_actuelle, statut, date_limite, description, created_at)
  → statut values : OUVERT, FERME, ANNULE, LIVRE
- achats_groupes_participants (id, achat_groupe_id, marchand_id, marchand_nom, quantite, date_inscription)

---

## COULEURS

- Vert principal : #059669
- Vert clair : #ECFDF5
- Rouge : #DC2626
- Orange : #F59E0B
- Bleu : #2563EB
- Violet : #7C3AED
- Cyan : #0891B2
- Gris texte : #6B7280
- Noir texte : #1F2937
- Blanc : #FFFFFF

---

## LANGUES

- Interface : français
- Commentaires code : français
- Monnaie : F CFA
- Langues vocales futures : dioula, baoulé (prévu)

---

## TECHNIQUE

- Expo SDK 54 (compatible Expo Go 54.0.6)
- React Native + TypeScript
- Supabase (@supabase/supabase-js)
- Socket.io (socket.io-client + server Node.js Express)
- react-native-reanimated
- expo-camera, expo-image-picker, expo-av, expo-speech
- expo-router (Stack Navigator)
- lucide-react-native + react-native-svg
- Groq API (Llama 3.3 + Whisper)
- react-native-chart-kit (ou alternative compatible Expo Go)

---

## BUILD

- EAS Build profil "preview" → APK Android
- Distribution "internal" (pas de stores)
- eas.json configuré
- Pour démo investisseurs uniquement