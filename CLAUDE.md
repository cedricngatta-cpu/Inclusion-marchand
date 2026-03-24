# CLAUDE.md — Guide complet Julaba Mobile

## Projet
Application mobile Android React Native / Expo SDK 54 pour l'inclusion économique des commerçants informels en Afrique.
Backend : Supabase (PostgreSQL) + Socket.io (realtime)
IA vocale : Mistral Small (LLM principal) + Groq (Whisper STT mobile + Llama fallback LLM) + Web Speech Synthesis (web) / expo-speech (mobile)
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
- AUCUN élément circulaire sauf le header
- Tous les borderRadius : maximum 10-12px
- SEULE EXCEPTION : coins arrondis en bas du header (borderBottomLeft/RightRadius)

### 2. Header Jùlaba — Design de référence
- Fond orange Jùlaba `colors.primary` (#C47316)
- Icônes en haut dans des carrés blancs arrondis (borderRadius: 10)
- Bouton retour sur écrans secondaires : flèche blanche dans carré blanc arrondi
- Tous les écrans suivent le MÊME style de header via `<ScreenHeader />`

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
- 4 marqueurs verts + ligne rouge animée qui défile
- Bip sonore (AudioContext web) + vibration (mobile + web) au scan
- Flash vert sur le cadre quand un code est détecté (500ms)

### Feedback au scan (`src/lib/scanFeedback.ts`)
- `playBeepSound()` : bip 1200Hz via Web AudioContext (aucun fichier MP3)
- `triggerVibration()` : Vibration RN (mobile) + navigator.vibrate (web)
- `onScanFeedback()` : combine bip + vibration
- `injectScanLineCSS()` : injecte `@keyframes scanLineMove` pour animation CSS fluide sur web
- Animation scanline : CSS `animation` sur web (60fps), `Animated` RN sur mobile

### Performance web (`src/components/WebBarcodeScanner.tsx`)
- getUserMedia optimisé : `width: { ideal: 1280, max: 1920 }`, `height: { ideal: 720, max: 1080 }`
- Détection via canvas réduit 320x240 (moins de pixels à analyser)
- Scan toutes les 200ms via `setInterval` (au lieu de requestAnimationFrame)
- Spinner `ActivityIndicator` pendant le démarrage caméra
- BarcodeDetector API (Chrome/Edge) — fallback photo upload (Firefox/Safari)

### Utilisé dans
1. Écran Scanner (dashboard) — `app/(tabs)/scanner.tsx`
2. Écran Vendre (scanner → panier → valider) — `app/(tabs)/vendre.tsx`
3. Formulaire Nouveau Produit (enregistrer code-barres) — `app/(tabs)/stock.tsx`

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

### Pipeline vocal (online)
1. **STT Web** : Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) — natif Chrome, gratuit, temps réel avec `interimResults`
2. **STT Mobile** : Groq Whisper (`whisper-large-v3-turbo`) — fallback mobile uniquement (direct API)
3. **LLM** : Mistral Small (`mistral-small-latest`) — principal, appel direct (CORS OK), temperature 0.3, max_tokens 300
4. **LLM Fallback** : Groq Llama 3.3 70B — si Mistral échoue (rate limit, réseau)
5. **TTS** : Web Speech Synthesis (web) / expo-speech (mobile) — instantané, pas d'appel réseau
6. **ElevenLabs** : désactivé (free tier bloqué) — code conservé en commentaire pour activation future avec clé payante

### Clés API nécessaires (.env)
- `EXPO_PUBLIC_MISTRAL_API_KEY` — LLM Mistral Small (principal)
- `EXPO_PUBLIC_GROQ_API_KEY` — STT Whisper (mobile) + LLM Llama fallback
- `EXPO_PUBLIC_SOCKET_URL` — URL du serveur proxy Render (aussi utilisé pour Socket.io)
- `EXPO_PUBLIC_ELEVENLABS_API_KEY` — optionnel (désactivé, tier payant requis)

### Prompt Whisper (mobile uniquement, < 896 caractères)
Le prompt guide Whisper avec le vocabulaire du marché ivoirien : produits, unités, monnaie, actions, noms, titres.
Défini dans `src/lib/groqSTT.ts` (constante `WHISPER_PROMPT`) et dans le proxy serveur (`server-deploy/index.js` + `server/index.js`).
**Note** : Sur web, Whisper est remplacé par Web Speech API (problème d'hallucination du prompt).

### Mode local (offline)
- Commandes par mots-clés → navigation directe
- Commandes différentes par rôle
- TTS confirmation + vibration

### Mode IA (online via Mistral/Groq)
- Conversation continue avec historique
- Données Supabase réelles dans le prompt (stock, ventes, commandes...)
- Données DIFFÉRENTES selon le rôle (fetchRoleContext)
- Actions exécutables après confirmation vocale (TOUTES les actions métier)
- Message d'accueil personnalisé avec résumé d'activité
- Intelligence proactive (alertes stock bas, suggestions)
- Tolérance ultra-forte aux erreurs de transcription STT (correction automatique par le LLM)
- Réponses ultra-courtes (1-2 phrases max), jamais de paragraphes
- Règles nombres : quantités marché (1-20 kg), correction "vingt-trois" → "trois"
- Vérification calculs : montant = quantité × prix unitaire (prix de la BDD)
- Contexte ivoirien : montants courants, "Madame" = client anonyme
- Orthographe : accents français obligatoires dans les réponses

### Actions vocales exécutables par rôle

**MARCHAND** : vendre, vendre_multiple, stock_ajout, stock_nouveau, commander, dette_ajout, dette_payee, check_stock, stats, navigate
**PRODUCTEUR** : publier, produit_modifier, commande_accepter, commande_refuser, livraison_statut, navigate
**AGENT** : enroler (avec extraction du nom de coopérative depuis la phrase vocale ex: "Inscris Bakary, coopérative AGRI-CI"), signaler, navigate
**COOPÉRATIVE** : enrolement_valider, enrolement_rejeter, achat_groupe, navigate
**ADMIN** : compte_desactiver, pin_reset, changer_role, navigate

### Architecture de l'assistant vocal

- `src/lib/groqSTT.ts` : Groq Whisper STT (mobile direct uniquement) + fallback natif — **web abandonné** (hallucination prompt)
- `src/lib/elevenlabsTTS.ts` : TTS principal — Web Speech Synthesis (web) / expo-speech (mobile) — ElevenLabs en option commentée
- `src/lib/mistralAI.ts` : Mistral Small LLM — appel direct API (CORS OK), temperature 0.3, max_tokens 300
- `src/lib/groqAI.ts` : chatWithHistory (Mistral principal → Groq fallback) + fetchRoleContext + buildSystemPrompt + parseAction + `isOnline()` / `setOnlineStatus()`
- `src/lib/voiceAssistant.ts` : Web Speech API STT (web) + enregistrement audio (mobile) + TTS + executeVoiceAction (actions Supabase) — exporte `startWebSpeechRecognition()` / `stopWebSpeechRecognition()` avec callback `onFinal` uniquement (pas d'affichage temps réel)
- `src/lib/productMatcher.ts` : Matching intelligent produits — aliases ivoiriens, noms locaux (attiéké→manioc, alloco→banane plantain), normalisation accents, similarité. Fonction `matchProduct(spokenWord, products)` utilisée par `resolveProduct()` dans voiceAssistant.ts
- `src/lib/webAudioRecorder.ts` : MediaRecorder web + volume metering — conservé pour usage mobile
- `src/components/VoiceModal.tsx` : UI du modal (conversation, confirmation, micro) — pas d'affichage temps réel, flux : "Je vous écoute..." → bulle verte utilisateur → "Réflexion..." → réponse assistant
- `src/lib/deepgramLLM.ts` : processVoiceCommand (wrapper LLM avec historique conversationnel)
- Format ACTION:: : `ACTION::{"type":"vendre","details":{...}}` — parsé par parseAction()
- Confirmation : boutons Confirmer/Annuler + voix "oui"/"non"
- Recherche ILIKE + matchProduct fallback pour noms de produits (insensible à la casse, pluriels, variantes ivoiriennes, erreurs STT)
- Messages d'erreur professionnels (jamais de codes techniques visibles par l'utilisateur)
- `fetchRoleContext()` injecte la liste complète des produits en stock dans le prompt système (nom, quantité, prix) pour que le LLM connaisse le catalogue du marchand
- Prompt système inclut le vocabulaire ivoirien (expressions marchandes + noms locaux de produits)

### Proxy serveur (Render)
- `POST /api/groq/stt` — proxy Groq Whisper (conservé pour mobile uniquement — web utilise Web Speech API)
- `POST /api/elevenlabs/tts` — proxy ElevenLabs TTS (conservé mais inutilisé — tier payant requis)
- Fichiers : `server-deploy/index.js` (déployé) + `server/index.js` (dev local) — toujours synchronisés

### Bouton micro
- Carré arrondi 56x56, orange `colors.primary` (#C47316), borderRadius: 10
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
- Protection brute-force : 5 échecs → blocage 5 min, 10 échecs → 30 min
- PIN temporaire : toujours `'0101'` (déclenche mustChangePin au login)
- PINs bloqués : '0101', '0000', '1234', '1111' (impossible de les garder)
- Actions admin vocales protégées par vérification de rôle (SUPERVISOR/COOPERATIVE)
- PIN offline hashé via SHA-256 (web) ou hash 32-bit salté (mobile) — fonction `hashPin()` dans AuthContext
- Clé de cache PIN : `cached_pin_hash` (jamais de PIN en clair dans AsyncStorage)

---

## OFFLINE-FIRST

- Stockage local : AsyncStorage (pas d'expo-sqlite)
- File de synchronisation : `src/lib/offlineQueue.ts` (transactions + stock)
- Cache offline : ProfileContext, HistoryContext, StockContext, ProductContext, NotificationContext
- L'app doit fonctionner sans connexion pour les opérations basiques (ventes, stock)

---

## PERFORMANCES PWA

### Contextes optimisés (re-renders)
- Tous les 7 Providers utilisent `useMemo` sur leur `value` pour éviter les re-renders en cascade
- Toutes les fonctions exposées par les contextes sont wrappées dans `useCallback`
- Contextes concernés : ProfileContext, HistoryContext, StockContext, ProductContext, NotificationContext, NetworkContext, VoiceButtonContext

### Throttle des appels Supabase
- `lastFetched = useRef<number>(0)` dans chaque contexte data (History, Stock, Product, Notification)
- Refetch automatique bloqué si < 30s (60s pour les notifications)
- Paramètre `force = false` sur les fonctions de fetch — `force: true` pour ignorer le throttle
- `useFocusEffect` sur les écrans appelle `fetchData()` (throttlé automatiquement)

### Images optimisées
- `src/lib/imageUtils.ts` : `getImageThumbnail(url, width, height)` transforme les URLs Supabase Storage en URLs `/render/image/public/` avec resize
- Thumbnails 200x200 dans les listes (marche, stock, admin/produits, mes-produits)
- Pleine résolution conservée dans les modaux de détail

### Service Worker (public/sw.js)
- 3 caches séparés : `julaba-v3` (app shell), `julaba-static-v3` (JS/CSS/fonts), `julaba-img-v1` (images)
- JS/CSS : stale-while-revalidate (affichage instantané + mise à jour en arrière-plan)
- Images Supabase Storage : cache-first avec LRU (max 100 images)
- API Supabase REST : network-first avec fallback cache (offline)
- Auth Supabase : network-only (jamais cachée)
- Socket.io : ignoré par le SW

### Transitions web
- CSS transitions globales injectées dans `_layout.tsx` : transform 0.15s, opacity 0.15s, background-color 0.2s
- `content-visibility: auto` sur les images pour le lazy rendering navigateur

### Splash screen
- Fond orange `colors.primary` + logo Jùlaba + spinner blanc + texte "Chargement..."
- Affiché pendant le chargement initial (desktop) via `ResponsiveWrapper`

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
  → statut values : NEGOTIATION, OPEN, COMPLETED, CANCELLED (contrainte SQL — PAS de valeurs FR)
- achats_groupes_participants (id, achat_groupe_id, marchand_id, marchand_nom, quantite, date_inscription)

---

## COULEURS (voir `src/lib/colors.ts`)

- Orange principal Jùlaba : #C47316 (`colors.primary`)
- Orange clair bg : #FFF8F0 (`colors.primaryBg`)
- Vert succès : #059669 (`colors.success` / `colors.green`)
- Vert clair : #ECFDF5 (`colors.greenLight`)
- Rouge : #DC2626 (`colors.error` / `colors.red`)
- Orange warning : #D97706 (`colors.warning`)
- Ambre : #F59E0B (`colors.amber500`)
- Bleu : #2563EB (`colors.info` / `colors.blue`)
- Violet : #7C3AED (`colors.purple`)
- Gris texte : #6B7280 (`colors.textSecondary`)
- Noir texte : #1F2937 (`colors.textPrimary`)
- Blanc : #FFFFFF (`colors.white`)
- **RÈGLE** : toujours utiliser `colors.*` au lieu de hex hardcodé

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
- Mistral API (mistral-small-latest) — LLM principal
- Groq API (Llama 3.3 70B fallback LLM + Whisper large-v3-turbo STT mobile)
- ElevenLabs API (TTS eleven_flash_v2_5) — désactivé, code conservé pour activation future
- react-native-chart-kit (ou alternative compatible Expo Go)

---

## BUILD

- EAS Build profil "preview" → APK Android
- Distribution "internal" (pas de stores)
- eas.json configuré
- Pour démo investisseurs uniquement