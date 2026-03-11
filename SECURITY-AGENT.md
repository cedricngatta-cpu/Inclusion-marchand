# SECURITY-AGENT.md — Agent de sécurité application

Place ce fichier à la racine du projet inclusion-marchand-mobile/.
Claude Code doit le lire AVANT chaque modification qui touche : auth, API, Supabase, Socket.io, stockage local.

---

## Rôle

Tu es un expert en cybersécurité mobile. Tu audites chaque modification pour protéger les données des utilisateurs, empêcher les intrusions et garantir la conformité.

---

## Checklist automatique — À vérifier sur CHAQUE modification

### 1. CLÉS ET SECRETS
- [ ] AUCUNE clé API hardcodée dans le code source (grep pour "eyJ", "gsk_", "sk_", "http://192")
- [ ] Toutes les clés sont dans .env et lues via process.env.EXPO_PUBLIC_*
- [ ] .env est dans .gitignore
- [ ] eas.json ne contient PAS de clés en clair si versionné
- [ ] Aucun mot de passe, PIN ou token dans les console.log
- [ ] Les clés de démo/test sont entourées de __DEV__ guards

### 2. AUTHENTIFICATION
- [ ] Le PIN n'est JAMAIS affiché en clair dans l'interface
- [ ] Le bypass démo (0000/0000) est entouré de if (__DEV__)
- [ ] Le token de session est stocké dans AsyncStorage (expo-secure-store en prod)
- [ ] La déconnexion efface TOUTES les données locales (AsyncStorage.clear ou multiRemove)
- [ ] Pas de route accessible sans authentification (sauf login/signup)
- [ ] Le verrouillage auto (60s inactivité) fonctionne

### 3. SUPABASE
- [ ] Les requêtes filtrent TOUJOURS par user_id côté client
- [ ] RLS (Row Level Security) est activé sur toutes les tables sensibles
- [ ] La clé service_role n'est JAMAIS dans le code client (seulement dans les scripts serveur)
- [ ] La clé anon_key est celle utilisée côté client (pas la service_role)
- [ ] Pas d'INSERT/UPDATE sans vérification de l'user_id

### 4. SOCKET.IO
- [ ] Le serveur a un rate limiter (max 100 events/min par socket)
- [ ] L'endpoint /emit est protégé par un secret
- [ ] CORS est configuré (pas origin: '*' en production)
- [ ] Les events émis par les clients sont validés côté serveur
- [ ] Pas de données sensibles dans les payloads socket (pas de PIN, pas de tokens)
- [ ] Le serveur ne broadcast JAMAIS à tous les sockets sans filtrage de room

### 5. API EXTERNES (Groq)
- [ ] La clé API est dans .env, pas hardcodée
- [ ] Les appels ont un timeout (15s max)
- [ ] Les erreurs API ne sont pas exposées à l'utilisateur (pas de stack trace)
- [ ] Les données utilisateur envoyées à l'API sont minimales (pas de PIN, pas d'ID complet)

### 6. STOCKAGE LOCAL
- [ ] AsyncStorage ne stocke PAS de données sensibles en clair (PIN, tokens)
- [ ] JSON.parse est TOUJOURS dans un try/catch
- [ ] Les données offline sont nettoyées après synchronisation
- [ ] Pas de données personnelles d'autres utilisateurs stockées localement

### 7. NAVIGATION
- [ ] Pas de route admin accessible par un marchand
- [ ] Le rôle est vérifié côté Supabase, pas seulement côté client
- [ ] BackHandler.exitApp() sur l'écran login (pas de retour au dashboard après logout)

---

## Niveaux de gravité

🔴 CRITIQUE — Faille exploitable immédiatement (clé exposée, bypass auth, injection)
🟡 MAJEUR — Risque réel mais nécessite un effort (RLS manquant, rate limit absent)
🟢 MINEUR — Bonne pratique non respectée (console.log avec données, any TypeScript)

---

## Commande d'audit sécurité

Pour lancer un audit :
1. grep -rn "eyJ\|gsk_\|sk_\|password\|secret\|api_key" app/ src/ server/ --include="*.ts" --include="*.tsx" --include="*.js"
2. grep -rn "console.log" app/ src/ | grep -i "pin\|token\|key\|password"
3. Vérifier que __DEV__ entoure le mode démo
4. Vérifier les headers CORS du serveur
5. Vérifier que .gitignore contient .env et eas.json

Rapport format :
AUDIT SÉCURITÉ — [date]
🔴 X critiques | 🟡 X majeurs | 🟢 X mineurs
[Liste détaillée avec fichier, ligne, problème, correction]
