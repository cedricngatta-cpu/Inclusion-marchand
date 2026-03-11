# TEST-AGENT.md — Agent de tests et validation

Place ce fichier à la racine du projet inclusion-marchand-mobile/.
Claude Code doit le lire AVANT chaque build APK et APRÈS chaque fonctionnalité majeure.

---

## Rôle

Tu es un testeur QA senior. Tu vérifies que chaque fonctionnalité marche de bout en bout, que les données se persistent, et que rien ne crash.

---

## SCÉNARIOS DE TEST PAR FLUX

### TEST 1 — Enrôlement
1. Se connecter en Agent (0722334455 / 1234)
2. Aller dans Enrôlement → remplir le formulaire (nom, tel, type, coopérative, boutique, adresse)
3. Valider → vérifier INSERT dans demandes_enrolement
4. Se connecter en Coopérative (2722445566 / 1234)
5. Aller dans Demandes → la nouvelle demande apparaît ?
6. Valider → l'agent reçoit une notification ?
7. Le nouveau membre peut se connecter ?
RÉSULTAT ATTENDU : ✅ demande créée → coopérative notifiée → validation → agent notifié → compte créé

### TEST 2 — Publication produit
1. Se connecter en Producteur (0733445566 / 1234)
2. Aller dans Publier → remplir (nom, prix, quantité, livraison, livreur, photo)
3. Valider → vérifier INSERT dans products
4. Le dashboard producteur se met à jour ?
5. Se connecter en Marchand → Marché Virtuel → le produit apparaît ?
6. Les infos producteur + livreur sont visibles ?
RÉSULTAT ATTENDU : ✅ produit publié → visible dans marché virtuel → infos complètes

### TEST 3 — Commande B2B
1. Se connecter en Marchand (0711223344 / 1234)
2. Marché Virtuel → cliquer sur un produit → fiche détail s'affiche ?
3. Choisir quantité → Confirmer commande
4. Vérifier INSERT dans orders
5. Se connecter en Producteur → Commandes → la commande apparaît ?
6. Accepter la commande → le marchand reçoit notification ?
RÉSULTAT ATTENDU : ✅ fiche détail → commande créée → producteur notifié → acceptation → marchand notifié

### TEST 4 — Livraison + Stock auto
1. En Producteur → marquer commande "En livraison"
2. Le marchand voit le statut changer en temps réel ?
3. Marquer "Livrée"
4. Le stock du marchand est mis à jour automatiquement ?
5. Le marchand reçoit notification "Livraison reçue" ?
RÉSULTAT ATTENDU : ✅ statuts en temps réel → stock +quantité → notification

### TEST 5 — Vente client final
1. En Marchand → Vendre → scanner ou sélectionner des produits
2. Ajouter 3 produits différents avec quantités variées
3. Mettre un nom de client
4. Valider en Espèces
5. TOUS les produits sont dans l'historique ?
6. Le stock de CHAQUE produit a diminué ?
7. La caisse du jour est mise à jour ?
8. Un produit à stock 0 est grisé et non vendable ?
RÉSULTAT ATTENDU : ✅ multi-produits → stock décrémenté → historique complet → stock 0 bloqué

### TEST 6 — Assistant vocal
1. Appuyer sur le bouton micro
2. Dire "combien il me reste de riz"
3. L'assistant répond vocalement avec la bonne quantité ?
4. Dire "vends 3 bonnet rouge à Fatou"
5. L'assistant demande confirmation ?
6. Confirmer → la vente est enregistrée avec le bon client ?
RÉSULTAT ATTENDU : ✅ compréhension → données réelles → action exécutée → client enregistré

### TEST 7 — Notifications
1. Faire une action (commande, vente, enrôlement)
2. Le destinataire reçoit la notification ?
3. La notification a le bon titre et message ?
4. Cliquer → le modal de détail s'ouvre ?
5. Cliquer "Voir" → redirige vers le bon écran ?
6. La notification est marquée comme lue ?
RÉSULTAT ATTENDU : ✅ notif reçue → bon contenu → clic → détail → redirection → marquée lue

### TEST 8 — Déconnexion
1. Se déconnecter
2. Appuyer sur retour Android → quitte l'app (pas retour au dashboard) ?
3. Relancer l'app → écran login (pas le dashboard) ?
4. Les données de l'ancien utilisateur sont effacées ?
RÉSULTAT ATTENDU : ✅ logout propre → pas de retour → données effacées

### TEST 9 — Achat groupé
1. Coopérative crée une demande → Producteur reçoit ?
2. Producteur propose un prix → Coopérative voit ?
3. Coopérative accepte → Marchands voient l'offre ?
4. Marchand rejoint → compteur se met à jour ?
RÉSULTAT ATTENDU : ✅ négociation → prix → ouverture → participation

### TEST 10 — Persistance
1. Faire une vente
2. Se déconnecter
3. Se reconnecter
4. La vente est toujours là ?
5. Le stock est toujours correct ?
RÉSULTAT ATTENDU : ✅ données persistées dans Supabase, pas volatiles

---

## COMMANDE DE TEST

Claude Code doit vérifier CHAQUE scénario en lisant le code :
1. L'INSERT Supabase est présent ?
2. L'event Socket.io est émis après ?
3. Le listener est présent côté destinataire ?
4. useFocusEffect recharge les données ?
5. Les noms de tables/colonnes sont corrects ?

Rapport :
TEST REPORT — [date]
✅ X/10 tests passent dans le code
⚠️ X tests partiels (détail)
❌ X tests échouent (détail + correction)
