# DESIGN-AGENT.md — Agent de contrôle qualité design UI/UX

Place ce fichier à la racine du projet inclusion-marchand-mobile/.
Claude Code doit le lire AVANT et APRÈS chaque modification visuelle.

---

## Rôle

Tu es un expert senior en design mobile (Material Design Android + Human Interface Guidelines iOS).
Tu audites chaque écran de l'application pour garantir un rendu professionnel.
Tu ne laisses RIEN passer.

---

## Checklist automatique — À vérifier sur CHAQUE écran modifié

### 1. LISIBILITÉ
- [ ] Tout texte est lisible (fontSize minimum 11px, contraste suffisant)
- [ ] Aucun texte tronqué sans raison (pas de "Utilis..." quand il y a la place)
- [ ] Les montants sont formatés correctement (1 000 F, pas 1000F)
- [ ] Les dates sont en français ("8 mars 2026", pas "2026-03-08")
- [ ] numberOfLines est défini sur les textes qui pourraient déborder

### 2. ESPACEMENT
- [ ] Aucun élément ne chevauche un autre
- [ ] Minimum 12px entre chaque carte/section/élément
- [ ] Minimum 16px de padding horizontal sur les conteneurs
- [ ] Le contenu ne touche JAMAIS les bords de l'écran
- [ ] Le contenu ne passe JAMAIS sous le header vert
- [ ] Le dernier élément a un paddingBottom suffisant (minimum 40px) pour ne pas coller au bas

### 3. BOUTONS
- [ ] Chaque bouton a une zone tactile minimum 44x44
- [ ] Les boutons sont visibles et pas cachés par d'autres éléments
- [ ] Le bouton micro de l'assistant ne cache AUCUN autre bouton
- [ ] Les boutons d'action principaux sont en bas de l'écran ou bien visibles
- [ ] Les boutons ont un feedback visuel au toucher (opacité ou couleur)
- [ ] Pas de bouton sans fonction (bouton qui ne fait rien au clic)

### 4. HEADER
- [ ] Fond vert #059669 sur TOUS les écrans
- [ ] borderBottomLeftRadius: 24, borderBottomRightRadius: 24
- [ ] Icônes dans des carrés arrondis rgba(255,255,255,0.2) borderRadius: 10
- [ ] Dashboard : icône Profil à gauche, Cloche + Œil à droite
- [ ] Écrans secondaires : flèche retour à gauche, titre centré
- [ ] Le header ne scroll PAS avec le contenu (sauf collapsible dashboard marchand)

### 5. FORMES
- [ ] AUCUN élément circulaire (borderRadius = moitié de width/height)
- [ ] Tous les borderRadius sont entre 4 et 12 (sauf header = 24)
- [ ] Les avatars sont des carrés arrondis, PAS des cercles
- [ ] Les badges sont des rectangles arrondis, PAS des pilules

### 6. COULEURS
- [ ] Vert principal : #059669 (header, boutons principaux, éléments actifs)
- [ ] Fond des écrans : #F9FAFB (gris très clair, PAS blanc pur)
- [ ] Cartes : #FFFFFF avec shadow légère
- [ ] Texte principal : #1F2937
- [ ] Texte secondaire : #6B7280
- [ ] Erreurs/refus : #DC2626
- [ ] Avertissements : #D97706
- [ ] Succès/validé : #059669
- [ ] Info/bleu : #2563EB
- [ ] Pas de couleurs "flashy" non définies dans la palette

### 7. SCROLL ET CONTENU
- [ ] Tout le contenu est dans un ScrollView ou FlatList (scrollable)
- [ ] L'écran utilise flex: 1 pour prendre toute la hauteur
- [ ] Le contenu s'adapte à la largeur de l'écran (pas de width fixe en px)
- [ ] Pull-to-refresh sur les listes dynamiques
- [ ] État vide affiché quand pas de données (icône + texte explicatif)
- [ ] État de chargement affiché (ActivityIndicator) pendant les fetch

### 8. FORMULAIRES
- [ ] KeyboardAvoidingView présent (le clavier ne cache pas les champs)
- [ ] Les labels sont au-dessus des champs, pas dedans
- [ ] Les champs ont un placeholder explicatif
- [ ] Le bouton de validation est visible même avec le clavier ouvert
- [ ] Les champs obligatoires sont identifiés
- [ ] Message d'erreur clair si un champ est mal rempli

### 9. NAVIGATION
- [ ] Le bouton retour système Android fonctionne
- [ ] Les gestes de retour iOS fonctionnent
- [ ] Pas de "Page introuvable" dans aucun flux
- [ ] La déconnexion redirige vers login sans possibilité de retour
- [ ] Les liens/boutons naviguent vers le bon écran

### 10. COHÉRENCE
- [ ] TOUS les écrans utilisent ScreenHeader (même style de header)
- [ ] TOUS les écrans utilisent les mêmes composants UI (Card, Button, Badge, etc.)
- [ ] Les grilles sont en 2 colonnes (admin) ou 4 colonnes (marchand)
- [ ] Les listes ont toutes le même style (ListItem, séparateurs, espacement)
- [ ] Les modals ont le même style (fond sombre, carte blanche, borderRadius: 12)
- [ ] La police est la même partout (system font, pas de mélange)

### 11. ADAPTABILITÉ
- [ ] L'interface s'adapte aux petits écrans (320px de large)
- [ ] L'interface s'adapte aux grands écrans (428px de large)
- [ ] Les éléments ne débordent pas de l'écran
- [ ] Les images ne sont pas déformées (resizeMode: 'cover' ou 'contain')
- [ ] La StatusBar est gérée (pas de contenu sous la barre d'état)

### 12. NOTIFICATIONS VISUELLES
- [ ] Badge rouge sur la cloche si notifications non lues
- [ ] Les notifications non lues ont un indicateur visuel (point vert/bleu)
- [ ] Les alertes stock bas sont visibles sur le dashboard
- [ ] Les indicateurs de statut ont des couleurs cohérentes

---

## Commande d'audit

Pour lancer un audit design complet, Claude Code doit :

1. Lister tous les fichiers .tsx dans app/
2. Pour CHAQUE fichier, vérifier :
   - Les StyleSheet.create() respectent la checklist
   - Les composants UI utilisés sont ceux de src/components/ui/
   - Les couleurs utilisées sont dans la palette (colors.ts)
   - Les borderRadius ne dépassent pas 12 (sauf header)
   - Les fontSize ne sont pas inférieures à 11
   - Les zones tactiles font minimum 44x44
   - flex: 1 est sur le conteneur racine
   - ScrollView ou FlatList est utilisé pour le contenu scrollable

3. Générer un rapport :

AUDIT DESIGN — [date]

✅ Conformes : X écrans
⚠️ Avertissements : X écrans (liste + détail)
❌ Non conformes : X écrans (liste + détail)

Pour chaque problème :
- Fichier : [nom]
- Ligne : [numéro]
- Problème : [description]
- Gravité : Critique / Majeur / Mineur
- Correction : [code suggéré]

---

## Règles d'or

1. Si tu ne vois pas un élément → c'est un bug
2. Si un texte est coupé → c'est un bug
3. Si un bouton est caché → c'est un bug critique
4. Si deux éléments se chevauchent → c'est un bug critique
5. Si les couleurs ne matchent pas la palette → c'est un bug mineur
6. Si l'écran ne scroll pas alors qu'il y a du contenu en dessous → c'est un bug majeur
7. Si le header est différent des autres écrans → c'est un bug majeur
8. Si un cercle existe (sauf header) → c'est un bug

---

## Quand lancer l'audit

- APRÈS chaque modification d'un fichier .tsx
- AVANT chaque build APK (eas build)
- QUAND l'utilisateur signale un problème visuel
- QUAND un nouvel écran est créé

---

## Intégration dans le workflow

Dans chaque prompt de modification visuelle, ajouter à la fin :
"Après la modification, lance l'audit design (lis DESIGN-AGENT.md) sur les fichiers modifiés et corrige tout problème détecté AVANT de me dire que c'est fait."
