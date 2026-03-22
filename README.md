# Julaba — "Ton dje est bien gere"

Plateforme nationale d'inclusion economique des acteurs vivriers — Cote d'Ivoire.

Application mobile Android (React Native / Expo) qui digitalise les operations des marches vivriers : ventes, stock, commandes B2B, achats groupes, livraisons, micro-credit et assistant vocal IA.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Mobile | React Native + Expo SDK 54, TypeScript |
| Navigation | expo-router (Stack Navigator) |
| Backend | Supabase (PostgreSQL + Storage + Realtime) |
| Realtime | Socket.io (serveur Node.js Express) |
| IA vocale | Groq API (Llama 3.3 70B + Whisper) + expo-speech |
| Animations | react-native-reanimated v4 |
| Icons | lucide-react-native |

## Les 5 roles

| Role | Description |
|------|-------------|
| **Marchand** | Vend au detail, gere stock/bilan, commande sur le Marche Virtuel |
| **Producteur** | Publie ses recoltes, traite les commandes B2B, gere les livraisons |
| **Agent terrain** | Enrole les marchands/producteurs, surveille son secteur |
| **Cooperative** | Valide les membres, cree les achats groupes, supervise les performances |
| **Superviseur** | Administration globale : utilisateurs, transactions, statistiques |

## Installation

```bash
# 1. Cloner le repo
git clone https://github.com/votre-org/julaba-mobile.git
cd julaba-mobile

# 2. Installer les dependances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Remplir les valeurs dans .env (voir section Variables d'environnement)

# 4. Lancer l'app
npx expo start

# 5. (Optionnel) Lancer le serveur Socket.io
cd server && npm install && npm start
```

## Variables d'environnement

Copier `.env.example` en `.env` et remplir les valeurs :

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cle anon (publique) Supabase |
| `EXPO_PUBLIC_SOCKET_URL` | URL du serveur Socket.io |
| `EXPO_PUBLIC_GROQ_API_KEY` | Cle API Groq (pour l'assistant vocal IA) |

## Seed (donnees de test)

```bash
# Executer le seed pour peupler la base avec des donnees de demo
SUPABASE_SERVICE_KEY="votre_cle_service_role" node scripts/seed.js

# Avec reset complet (supprime les donnees existantes)
SUPABASE_SERVICE_KEY="votre_cle_service_role" node scripts/seed.js --reset
```

La cle `service_role` se trouve dans : **Supabase Dashboard > Settings > API > service_role (secret)**

## Comptes de test

Apres avoir execute le seed, les comptes suivants sont disponibles :

| Role | Nom | Telephone | PIN |
|------|-----|-----------|-----|
| Marchand | Kouassi Jean-Baptiste | `0711223344` | `1234` |
| Marchand | Adjoua Marie Kone | `0555667788` | `1234` |
| Producteur | Coulibaly Mamadou | `0733445566` | `1234` |
| Producteur | Koffi Nee Adjoua | `0577889900` | `1234` |
| Agent terrain | Ouattara Dramane | `0722334455` | `1234` |
| Agent terrain | N'Guessan Eleonore | `0511334466` | `1234` |
| Cooperative | Cooperative AGRI-CI | `2722445566` | `1234` |
| Superviseur | Superviseur | `0000` | `0000` |

## Build APK

```bash
# Build APK Android (distribution interne)
eas build --profile preview --platform android
```

## Structure du projet

```
app/
  (auth)/        # Login, Signup
  (tabs)/        # Ecrans marchand (commercant, vendre, stock, bilan, marche...)
  admin/         # Dashboard superviseur
  agent/         # Dashboard agent terrain
  cooperative/   # Dashboard cooperative
  producteur/    # Dashboard producteur
src/
  components/    # Composants reutilisables (VoiceModal, PinInput, ScreenHeader...)
  context/       # Providers React (Auth, Stock, History, Notification...)
  lib/           # Utilitaires (supabase, socket, colors, groqAI, voiceAssistant)
server/          # Serveur Socket.io (Node.js Express)
scripts/         # Seed, simulation, migrations SQL
assets/          # Images, icones, logo SVG
```

## Licence

MIT
