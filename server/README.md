# Serveur Realtime — Julaba

Serveur Socket.io pour la synchronisation en temps réel entre les appareils.

## Démarrage

```bash
cd server
npm start          # production
npm run dev        # développement (auto-reload avec nodemon)
```

## Configuration

Dans le fichier `.env` de l'app mobile, mets l'IP de ce PC :

```
EXPO_PUBLIC_SOCKET_URL=http://192.168.100.133:3001
```

Pour trouver ton IP locale :
- **Windows** : `ipconfig` → cherche "Adresse IPv4"
- **Mac/Linux** : `ifconfig` ou `ip addr`

Les téléphones et le PC doivent être sur **le même réseau Wi-Fi**.

## Événements Socket.io

| Événement | Direction | Description |
|-----------|-----------|-------------|
| `user-connect` | Client → Serveur | Rejoindre les rooms (userId + storeId) |
| `nouvelle-vente` | Client → Serveur → Clients | Vente validée |
| `stock-update` | Client → Serveur → Clients | Stock modifié |
| `nouvelle-notification` | Client → Serveur → Client(s) | Notification ciblée |
| `connected` | Serveur → Client | Confirmation de connexion |

## Routes HTTP

- `GET /health` — État du serveur et liste des clients connectés
- `POST /notify` — Envoyer une notification (utile pour les webhooks Supabase)

```bash
# Envoyer une notification à tous
curl -X POST http://localhost:3001/notify \
  -H "Content-Type: application/json" \
  -d '{"targetId":"ALL","title":"Test","message":"Ceci est un test","type":"INFO"}'
```

## Démo investisseurs

1. Lancer le serveur : `npm start`
2. Mettre à jour l'IP dans `.env` de l'app
3. Relancer l'app Expo sur les 2 téléphones
4. Se connecter avec le même compte (ou 2 comptes du même magasin)
5. Faire une vente sur le téléphone A → le téléphone B se met à jour instantanément
