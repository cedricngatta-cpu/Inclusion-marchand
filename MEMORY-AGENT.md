# MEMORY-AGENT.md — Agent de mémoire et contexte

Place ce fichier à la racine du projet inclusion-marchand-mobile/.
Claude Code doit le lire AU DÉBUT de chaque nouvelle session.

---

## Rôle

Tu es l'agent de mémoire du projet. Tu gardes la trace de tout ce qui a été fait, décidé et corrigé pour éviter de refaire les mêmes erreurs ou de perdre le contexte.

---

## HISTORIQUE DES DÉCISIONS PRISES

### Architecture
- App mobile React Native / Expo SDK 54 (compatible Expo Go 54.0.6)
- Backend : Supabase (PostgreSQL) — projet ref: dinocjmwktrxqupyjsqn
- Realtime : Socket.io (serveur Node.js Express sur port 3001)
- IA vocale : Groq API (Llama 3.3 70B + Whisper large v3 turbo)
- TTS : expo-speech (fr-FR)
- Navigation : expo-router avec Stack Navigator (PAS de TabNavigator)
- Build : EAS Build profil "preview" → APK Android (distribution internal)

### Noms de tables Supabase (VRAIS noms utilisés dans le code)
- profiles, stores, products, stock, orders, transactions
- notifications, activity_logs, credits_clients
- demandes_enrolement (PAS enrollments)
- reports (PAS signalements)
- achats_groupes, achats_groupes_participants

### Colonnes importantes à retenir
- demandes_enrolement : date_demande (PAS created_at), statut (PAS status)
- orders : status utilise PENDING/ACCEPTED/SHIPPED/DELIVERED/CANCELLED — jamais SHIPPING ni REJECTED
- profiles : role utilise MERCHANT/PRODUCER/FIELD_AGENT/COOPERATIVE/SUPERVISOR
- achats_groupes : statut contrainte SQL réelle = NEGOTIATION/OPEN/COMPLETED/CANCELLED (PAS OUVERT/FERME) — colonnes FR : producteur_id, nom_produit, quantite_totale, quantite_minimum, quantite_actuelle, statut, date_limite, prix_negocie
- achats_groupes_participants : marchand_nom (PAS marchand_name), quantite (PAS quantity)
- transactions : montant = price (PAS total_amount) ; type = 'VENTE' requis ; pas de payment_method ni seller_id
- reports : reporter_id, member_name, problem_type, description, status — PAS agent_id ni target_id ni reason ni details
- products : store_id requis, zone_livraison / delai_livraison (FR) — pas is_marketplace, producer_id, quantity_available

### Script simulate.js (scripts/simulate.js)
- Simule 5 rôles en 7 actes (enrôlement, publication, commandes, livraison, ventes, achat groupé, signalement)
- Admin reçoit une notification pour CHAQUE action (notifyAdmin() après chaque opération)
- loadStores() doit être appelé après loadUsers() — S.producteur/marchand1/marchand2 stockent les store IDs
- Admin détecté par phone_number === '0000'
- Chaque INSERT a un log d'erreur explicite : if (err) console.log('❌ INSERT ...')

### Design system
- PAS de cercles (borderRadius max 12, sauf header = 24)
- Header vert #059669 sur tous les écrans
- Icônes header dans carrés rgba(255,255,255,0.2) borderRadius: 10
- Dashboard : profil à gauche, cloche + œil à droite (showProfile=true, showBack=false)
- Écrans secondaires : flèche retour à gauche, titre centré (showBack=true)
- Grille admin : 2 colonnes
- Bouton micro : carré arrondi 56x56, bottom:30, right:20, visible UNIQUEMENT si connecté

### Bugs corrigés (NE PAS les réintroduire)
- enrollments → renommé en demandes_enrolement partout
- created_at → renommé en date_demande pour demandes_enrolement
- signalements → renommé en reports
- gpt-3.5-turbo → corrigé en llama-3.3-70b-versatile
- Tab bar en bas → supprimée, navigation par grille + retour système
- Bouton "+ TEST" notifications → supprimé
- Cercles → remplacés par carrés arrondis partout
- Grille admin 3-4 colonnes → corrigée en 2 colonnes
- router.push('/login') → corrigé en router.replace('/login') au logout
- "Page introuvable" après login → corrigé avec setTimeout dans app/index.tsx
- Bouton profil devenu retour en APK → corrigé avec showProfile prop explicite
- TTS qui se coupe à la navigation → corrigé en attendant onDone avant de naviguer
- Socket.emit sans INSERT Supabase → corrigé, toujours Supabase d'abord
- useFocusEffect manquant → ajouté sur tous les écrans dynamiques
- simulate.js orders → buyer_id/seller_id corrigés en buyer_store_id/seller_store_id
- simulate.js orders → REJECTED corrigé en CANCELLED, SHIPPING corrigé en SHIPPED
- simulate.js transactions → total_amount/unit_price corrigés en price ; type/status ajoutés
- simulate.js achats_groupes → toutes colonnes corrigées en FR (producteur_id, nom_produit, statut, OUVERT...)
- simulate.js achats_groupes_participants → marchand_name→marchand_nom, quantity→quantite
- simulate.js reports → reporter_id→agent_id, member_id→target_id, description→details
- simulate.js products → store_id ajouté, colonnes inventées supprimées (is_marketplace, producer_id...)
- fontSize < 11 → corrigé partout (231 remplacements : 8/9/10→11, plus 3 occurrences de fontSize: 7→11)
- fontSize: 11 = limite minimale acceptée (pas d'avertissement, c'est valide)

### Comptes de démo
- Marchand : 0711223344 / 1234
- Producteur : 0733445566 / 1234
- Agent : 0722334455 / 1234
- Coopérative : 2722445566 / 1234
- Admin : 0000 / 0000 (protégé par __DEV__)

---

## JOURNAL DES SESSIONS

### Session 10 mars 2026
- Modifié : server/index.js, src/context/NotificationContext.tsx, app/(tabs)/notifications.tsx, CLAUDE.md, app/cooperative/achats.tsx, app/producteur/commandes.tsx, app/(tabs)/achats-groupes.tsx, app/agent/enrolement.tsx, app/cooperative/demandes.tsx, app/cooperative/membres.tsx, app/admin/utilisateurs.tsx
- Ajouté : scripts/migration_achats_groupes.sql (v2), scripts/migration_cooperative_rattachement.sql, DESIGN-AGENT.md, SECURITY-AGENT.md, MEMORY-AGENT.md, TEST-AGENT.md, DIAGNOSTIC-AGENT.md, CONSEIL-AGENT.md, DEBUG-AGENT.md, RESCUE-AGENT.md
- Fonctionnalités ajoutées :
  1. Flux achat groupé 2 phases (NEGOTIATION→OPEN→COMPLETED/CANCELLED) — coopérative demande prix, producteur propose, coop accepte
  2. Rattachement coopérative à l'enrôlement — 3 modes (select/none/autre), cooperative_id dans profiles + demandes_enrolement
  3. Système de notifications professionnel — matrice complète par rôle, messages précis, couleurs par type, date relative dans liste, date complète dans modal
  4. 3 nouveaux events Socket.io : demande-prix-groupe, prix-groupe-propose, prix-groupe-accepte, cooperative-inconnue
- Score diagnostic : non effectué
- TODO restant : tester les flux end-to-end, build APK démo

### Session 10 mars 2026 (suite) — Simulation & Admin
- Modifié : scripts/simulate.js, MEMORY-AGENT.md
- Bugs corrigés :
  - simulate.js : 7 tables avec colonnes incorrectes (orders, products, transactions, achats_groupes, achats_groupes_participants, reports)
- simulate.js : n'insérait pas dans activity_logs → "Activité récente" vide → ajout de logActivity() après chaque action
- admin/index.tsx : manquait 5 events Socket.io (achat-groupe-cree, achat-groupe-rejoint, prix-groupe-propose, prix-groupe-accepte, demande-prix-groupe)
  - orders : buyer_id→buyer_store_id, seller_id→seller_store_id, REJECTED→CANCELLED, SHIPPING→SHIPPED
  - achats_groupes : toutes colonnes corrigées en noms FR, statut NEGOTIATION/OPEN→OUVERT
  - transactions : price au lieu de total_amount, type et status ajoutés, colonnes fantômes supprimées
  - reports : agent_id/target_id/reason/details au lieu des noms inventés
- Fonctionnalités ajoutées :
  - loadStores() dans main() pour obtenir les store IDs avant les INSERTs
  - notifyAdmin() après chaque action (20+ notifications admin)
  - Logs d'erreur explicites après chaque INSERT/UPDATE
  - Détection admin par phone_number === '0000'
- Score diagnostic : non effectué
- TODO restant : tester en conditions réelles, build APK démo

### Session 10 mars 2026 (suite 2) — Refactoring fontSize + Scripts d'audit
- Modifié : 48 fichiers .tsx (fontSize 8/9/10→11), scripts/audit-design.js, scripts/audit-navigation.js, MEMORY-AGENT.md
- Ajouté : scripts/audit-design.js, scripts/audit-navigation.js, scripts/fix-fontsize.js, scripts/check-kav.js
- Bugs corrigés :
  - 234 occurrences fontSize < 11 (8, 9, 10, 7) → corrigées en 11 dans app/ et src/components/
  - audit-design.js : opacity: 0.6 conditionnel compté comme invisible → ignoré (feedback visuel valide)
  - audit-design.js : router.push vers login depuis signup.tsx → ignoré (navigation auth normale)
  - audit-design.js : KeyboardAvoidingView absent signalé comme erreur → reclassifié en warning
  - audit-navigation.js : routes (tabs)/* comptées comme orphelines → corrigé (groupe expo-router normal)
  - audit-navigation.js : routes via router.push(item.path) non détectées → ajout pattern data_path
  - audit-navigation.js : routes via pathname: '...' dans router.push non détectées → ajout au pattern
  - audit-navigation.js : (auth)/(tabs) dans Stack.Screen comptés comme liens brisés → filtrés
- Fonctionnalités ajoutées :
  - scripts/audit-design.js : 12 catégories, score sémantique par catégorie impactée
  - scripts/audit-navigation.js : carte des routes, liens brisés, orphelins, routes notif
- Score diagnostic audit-design : 77/100 (0 erreur critique, warnings advisory seulement)
- Score diagnostic audit-navigation : 98/100 (0 lien brisé, 1 orphelin réel : /finance non lié)
- TODO restant :
  - /credit est maintenant orphelin (remplacé par /finance dans la grille marchande) — à supprimer si non utile ailleurs
  - KeyboardAvoidingView manquant dans 8 fichiers (principalement barres de recherche, faible impact)
  - Tester en conditions réelles + build APK démo

### Session 10 mars 2026 (suite 3) — finance.tsx + utilisateurs admin
- Modifié : app/(tabs)/commercant.tsx, app/admin/utilisateurs.tsx, MEMORY-AGENT.md
- Bugs corrigés :
  - commercant.tsx : quickAction "Finance" pointait vers /(tabs)/credit (placeholder) → corrigé vers /(tabs)/finance (écran complet avec Supabase data)
  - utilisateurs.tsx : filtre rôle comparait lowercase ('merchant') vs DB uppercase ('MERCHANT') → corrigé avec .toUpperCase() strict
- Fonctionnalités ajoutées à utilisateurs.tsx :
  - boutique_name et address ajoutés au SELECT profiles
  - fetchUserStats() : charge store (stores table), stats ventes (count + sum transactions), commandes (count orders) quand modal s'ouvre
  - Socket.io listeners : onSocketEvent('enrolement-valide') et ('nouvel-enrolement') → fetchUsers()
  - Modal enrichie : boutique, adresse, store type, 3 statBox (ventes, CA, commandes)
  - handleDisable() : bloque via pin='DISABLED' (en attendant colonne active inexistante)
- Score diagnostic audit-design : 77/100 (0 erreur critique, tous 🟡)
- Score diagnostic audit-navigation : 98/100 (1 orphelin : /credit, remplacé par /finance)
- TODO restant :
  - credit.tsx orphelin → à supprimer ou lier depuis finance.tsx
  - Build APK démo

### Session 11 mars 2026 — Terminologie coopérative + flux PIN oublié
- Modifié : app/cooperative/demandes.tsx, app/cooperative/index.tsx, src/context/NotificationContext.tsx, src/context/AuthContext.tsx, app/(auth)/login.tsx, app/_layout.tsx, app/(tabs)/profil.tsx, MEMORY-AGENT.md, CLAUDE.md
- Ajouté : src/components/ChangePinModal.tsx
- Bugs corrigés :
  - cooperative/demandes.tsx : textes "VALIDER"/"REJETER" remplacés par "CONFIRMER CE MEMBRE"/"CE N'EST PAS UN DE NOS MEMBRES"
  - cooperative/demandes.tsx : onglets "En attente"→"À vérifier", "Validées"→"Confirmés", "Refusées"→"Rejetés"
  - cooperative/demandes.tsx : labels statut "En attente"→"À vérifier", "Validée"→"Confirmé", "Refusée"→"Rejeté"
  - cooperative/demandes.tsx : titre "Demandes"→"Validations", sous-titre "Enrôlements en attente"→"Membres à vérifier"
  - cooperative/demandes.tsx : boutons en colonne (column) pour éviter overflow du long texte
  - cooperative/index.tsx : "Demandes d'enrôlement"→"Validations", "X demandes en attente"→"X membres à vérifier", badge "EN ATTENTE"→"À VÉRIFIER", "Valider les nouveaux membres"→"Vérifier les nouveaux membres"
  - cooperative/index.tsx : compteur pendingEnroll filtré par cooperative_id = user.id
  - NotificationContext.tsx : notification coopérative (nouvel-enrolement) → titre "Nouveau membre à vérifier", message "L'agent [nom] a inscrit [membre] ([type]). Vérifiez que cette personne est bien un de vos membres."
- Fonctionnalités ajoutées :
  - Flux PIN oublié : modal dans login.tsx (phone input, Supabase reset à '0101', notif admins, limiteur 3 tentatives)
  - ChangePinModal : bloquant si mustChangePin=true (_layout.tsx), optionnel depuis profil.tsx
  - AuthContext : mustChangePin state, vérifié au login si pin==='0101'
- Score diagnostic : non effectué (TODO)
- TODO restant : build APK démo, tester flux PIN oublié en conditions réelles

### Session [date] — Ce qui a été fait
(Claude Code doit mettre à jour cette section à la fin de chaque session)

Format :
```
### Session [date]
- Modifié : [liste des fichiers]
- Ajouté : [nouveaux fichiers]
- Bugs corrigés : [liste]
- Fonctionnalités ajoutées : [liste]
- Score diagnostic : X/100
- TODO restant : [liste]
```

---

## RÈGLE

Au début de chaque session, Claude Code doit :
1. Lire MEMORY-AGENT.md
2. Lire CLAUDE.md
3. Dire "Contexte chargé. Dernière session : [date]. Score : X/100. TODO prioritaire : [liste]"
4. NE PAS refaire les erreurs listées dans "Bugs corrigés"
