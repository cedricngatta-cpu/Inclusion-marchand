# CLAUDE.md — Guide complet Inclusion Marchand Mobile

## Projet
Application mobile Android React Native / Expo SDK 54 pour l'inclusion économique des commerçants informels en Afrique.
Backend : Supabase (PostgreSQL) + Socket.io (realtime)
IA vocale : Groq API (Llama 3.3 + Whisper) + expo-speech
Objectif : Build APK via EAS Build pour démo investisseurs
Cible : Commerçants peu alphabétisés, marchés vivriers, zones à connexion instable

---

## LES 5 RÔLES

### Marchand (commerçant)
- Enregistrer des ventes (scanner + vocal)
- Gérer son stock
- Consulter ses revenus et bilan
- Commander des produits via le Marché Virtuel
- Carnet de dettes clients
- Accéder aux services financiers (microcrédit, assurance, score de crédit)

### Producteur
- Publier des récoltes/produits sur le Marché Virtuel
- Recevoir et traiter les commandes des marchands
- Gérer ses livraisons (statut en temps réel)
- Voir et modifier ses produits publiés
- Suivre ses revenus

### Coopérative (tour de contrôle)
- Valider/rejeter les enrôlements (gardien du réseau)
- Superviser les performances de tous les membres
- Faciliter les achats groupés B2B
- Analyser les tendances du marché
- Gérer la communauté des membres

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

1. Agent enrôle un marchand/producteur sur le terrain
2. Coopérative valide l'inscription → compte créé
3. Producteur publie une récolte sur le Marché Virtuel (avec photo, prix, prix livraison, livreur)
4. Marchand voit le produit, consulte les infos producteur/livreur, passe commande
5. Producteur accepte la commande
6. Producteur marque la livraison (en préparation → en livraison → livrée)
7. Marchand suit en temps réel, stock mis à jour automatiquement à la livraison
8. Marchand vend au client final (scanner ou vocal)
9. Tout est supervisé par la Coopérative et l'Admin en temps réel

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
- Actions exécutables après confirmation vocale (publier, vendre, commander, stock)
- Message d'accueil personnalisé avec résumé d'activité
- Intelligence proactive (alertes stock bas, suggestions)

### Bouton micro
- Carré arrondi 56x56, vert #059669, borderRadius: 10
- Position absolute, bottom: 30, right: 20
- Présent sur TOUS les écrans

---

## NOTIFICATIONS

- Vraies notifications (pas de bouton test)
- Stockées dans Supabase (table notifications)
- Persistantes après déconnexion
- Cliquables → détail complet de l'événement
- Types : commande, livraison, enrôlement, vente, signalement
- Badge non lu sur l'icône cloche

---

## PAIEMENTS

### Modes
- Espèces
- Mobile Money (Wave, Orange Money, MTN MoMo) — prévu pour le futur
- Crédit client (carnet de dettes)

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
- achat-groupe-cree/rejoint
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
- stock (id, user_id, nom, prix, quantite, categorie, barcode, image_url, created_at)
- ventes/transactions (id, user_id, produit_id, quantite, prix_total, client_nom, mode_paiement, created_at)
- products_marche (id, producteur_id, nom, prix, quantite_disponible, description, photo_url, categorie, prix_livraison, zone_livraison, delai_livraison, livreur_nom, livreur_telephone, unite, created_at)
- commandes (id, marchand_id, producteur_id, produit_id, quantite, prix_total, statut, date_commande, date_livraison)
- livraisons (id, commande_id, statut, date_expedition, date_livraison)
- demandes_enrolement (id, agent_id, nom, telephone, type, adresse, nom_boutique, photo_url, statut, motif_rejet, date_demande, date_traitement)
- achats_groupes (id, cooperative_id, produit_id, producteur_id, prix_negocie, quantite_totale, quantite_minimum, statut, date_limite, created_at)
- achats_groupes_participants (id, achat_groupe_id, marchand_id, quantite, date_inscription)
- signalements (id, agent_id, cible_id, motif, details, statut, date_signalement)
- notifications (id, user_id, titre, message, type, data jsonb, lu, created_at)
- activity_logs (id, user_id, user_name, action, details, type, created_at)
- credits_clients (id, marchand_id, client_nom, client_telephone, montant_du, date_credit, date_echeance, statut)

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