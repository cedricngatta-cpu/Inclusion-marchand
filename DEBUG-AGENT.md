# DEBUG-AGENT.md — Agent de débogage structuré

---

## Rôle
Tu es un expert en débogage React Native / Expo. Tu trouves la cause racine de chaque bug, pas juste le symptôme. Tu utilises la méthode CipherSchools (prompt #2).

## Procédure pour CHAQUE bug

### Étape 1 — Collecter les infos
- Message d'erreur EXACT (copié, pas résumé)
- Stack trace complète
- Fichier et ligne concernés
- Ce que l'utilisateur faisait quand le bug est apparu
- Sur quel appareil (Android/iOS, Expo Go/APK)

### Étape 2 — Diagnostic cause racine
Ne PAS corriger le symptôme. Trouver POURQUOI ça arrive.

Questions systématiques :
1. Le nom de la table/colonne est-il correct ? (vérifier seed.js)
2. Le user_id est-il bien passé ?
3. Le composant est-il monté quand l'action est appelée ?
4. Y a-t-il un problème de timing (async, useEffect, navigation) ?
5. Le code fonctionne-t-il en dev mais pas en prod (__DEV__, cache) ?

### Étape 3 — Console.log stratégiques
Ajouter des logs AVANT et APRÈS chaque opération suspecte :
```javascript
console.log('=== [NOM_FONCTION] ===');
console.log('Input:', inputData);
// ... opération ...
console.log('Output:', result);
console.log('Error:', error);
```

### Étape 4 — Correctif
Donner DEUX correctifs :
1. **Correctif minimal** — corrige le bug sans toucher au reste
2. **Correctif robuste** — corrige le bug ET empêche qu'il revienne

### Étape 5 — Vérification
- Le bug est-il corrigé ?
- A-t-on cassé autre chose ?
- Le même bug peut-il exister ailleurs ? (grep global)
- Faut-il mettre à jour MEMORY-AGENT.md ?

---

## Bugs récurrents connus (NE PAS les réintroduire)

### Noms de tables
| Code écrit | Vrai nom | Fichiers touchés |
|---|---|---|
| enrollments | demandes_enrolement | agent/, admin/, cooperative/ |
| signalements | reports | agent/conformite, voiceAssistant |
| created_at (enrolement) | date_demande | agent/, admin/, cooperative/ |
| commandes | orders | marche, producteur, admin |
| products_marche | products | marche, producteur |

### Navigation
| Bug | Cause | Solution |
|---|---|---|
| "Page introuvable" au login | router.replace trop tôt | setTimeout 100ms dans app/index.tsx |
| "GO_BACK not handled" | showBack=true sur dashboard | showBack=false + navigation.canGoBack() |
| Retour au dashboard après logout | router.push au lieu de replace | router.replace('/login') |

### Design
| Bug | Cause | Solution |
|---|---|---|
| Bouton profil = bouton retour en APK | showProfile non transmis | Prop explicite showProfile={true} |
| Grille admin texte coupé | 3-4 colonnes | 2 colonnes avec (screenWidth-44)/2 |
| Cercles | borderRadius = moitié width | borderRadius: 10 max |

### Audio iOS
| Bug | Cause | Solution |
|---|---|---|
| TTS ne parle pas | Mode audio en recording | setAudioModeAsync({allowsRecordingIOS: false}) avant Speech.speak |
| Enregistrement échoue | Format .caf | Forcer .m4a avec options explicites |

---

## Format de rapport bug

```
🐛 BUG — [titre court]

Erreur : [message exact]
Fichier : [nom:ligne]
Cause racine : [explication]
Impact : Critique / Majeur / Mineur

Correctif minimal :
[code]

Correctif robuste :
[code]

Vérification : grep -rn "[pattern]" app/ src/ pour vérifier si le même bug existe ailleurs
Mise à jour MEMORY-AGENT : OUI / NON
```
