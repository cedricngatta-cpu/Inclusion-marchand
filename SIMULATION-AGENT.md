# SIMULATION-AGENT.md — Équipe virtuelle de test

Place ce fichier à la racine du projet inclusion-marchand-mobile/.

---

## Rôle

Tu es une équipe complète de testeurs virtuels. Chaque bot simule un utilisateur réel avec un rôle précis. Ils font des actions réalistes dans Supabase et émettent des events Socket.io comme si c'étaient de vraies personnes.

L'utilisateur humain se connecte en ADMIN sur son téléphone et observe tout en temps réel.

---

## L'ÉQUIPE VIRTUELLE

| Bot | Rôle | Compte | Ce qu'il fait |
|---|---|---|---|
| Bot Coulibaly | Producteur | 0733445566 | Publie des récoltes, propose des prix, accepte des commandes, livre |
| Bot Kouassi | Marchand | 0711223344 | Commande, vend, gère stock |
| Bot Adjoua | Marchand 2 | 0555667788 | Commande, vend, rejoint achats groupés |
| Bot Ouattara | Agent | 0722334455 | Enrôle, signale |
| Bot AGRI-CI | Coopérative | 2722445566 | Valide, crée achats groupés |

---

## SCÉNARIO COMPLET (10 minutes, 21 actions)

Acte 1 — ENRÔLEMENT (2 min)
1. Agent enrôle "Traoré Ibrahim" marchand → socket nouvel-enrolement
2. Agent enrôle "Diallo Aminata" producteur → socket nouvel-enrolement
3. Coopérative valide Traoré → socket enrolement-valide
4. Coopérative rejette Diallo (photo floue) → socket enrolement-rejete

Acte 2 — PUBLICATION (2 min)
5. Producteur publie "Riz parfumé 25kg" 18000F → socket nouveau-produit-marche
6. Producteur publie "Maïs frais 10kg" 5000F → socket nouveau-produit-marche

Acte 3 — COMMANDES (2 min)
7. Marchand 1 commande 20 riz → socket nouvelle-commande
8. Marchand 2 commande 10 maïs → socket nouvelle-commande
9. Producteur accepte commande 1 → socket commande-acceptee
10. Producteur refuse commande 2 → socket commande-refusee

Acte 4 — LIVRAISON (1 min)
11. Producteur marque en livraison → socket livraison-en-cours
12. Producteur marque livrée → socket livraison-terminee + stock marchand +20

Acte 5 — VENTES (2 min)
13. Marchand 1 vend 5 riz à Yao espèces → socket nouvelle-vente
14. Marchand 1 vend 3 riz à Fatou mobile → socket nouvelle-vente
15. Marchand 2 vend 2 bonnet rouge à Sarah → socket nouvelle-vente

Acte 6 — ACHAT GROUPÉ (2 min)
16. Coopérative crée achat groupé riz → socket demande-prix-groupe
17. Producteur propose 12000F → socket prix-groupe-propose
18. Coopérative accepte → socket prix-groupe-accepte
19. Marchand 1 rejoint (30 sacs) → socket achat-groupe-rejoint
20. Marchand 2 rejoint (25 sacs) → socket achat-groupe-rejoint

Acte 7 — SIGNALEMENT (30 sec)
21. Agent signale Tra Bi Emmanuel → socket signalement-conformite

---

## UTILISATION

Terminal 1 : cd server && node index.js
Terminal 2 : $env:SUPABASE_SERVICE_KEY="ta_clé"; node scripts/simulate.js
Téléphone : connecté en Admin (0000/0000), observer le dashboard

Modes :
- DELAY = 5000 → mode normal (10 min)
- DELAY = 2000 → mode rapide (4 min)
- DELAY = 15000 → mode démo investisseur (25 min, le temps d'expliquer)
