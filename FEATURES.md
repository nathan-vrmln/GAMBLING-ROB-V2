# Fonctionnalités du Jeu de Slot Machine

## 🎰 Bouton ALL IN

### Description
Le bouton **ALL IN** permet de miser automatiquement tous vos robions sur un seul spin avec des effets visuels dynamiques basés sur le résultat.

### Fonctionnement
1. **Clic sur ALL IN**: Met votre mise au maximum (tous vos robions)
2. **Pendant le spin**: Effet rouge pulsant sur l'écran (indique le risque)
3. **Résultat gagnant**: Flash vert brillant
4. **Résultat perdant**: Flash rouge intense
5. Les effets disparaissent après 3 secondes

### Emplacement
- Situé juste au-dessus du bouton SPIN
- Style rouge avec animation pulsante dorée
- Toujours visible en mode jeu

## 🖼️ Système de Backgrounds

### Changement de Fond
- **Bouton**: 🌄 en bas à droite (à côté du bouton musique 🔊)
- **Fond 0**: Dégradé par défaut (violet/rose)
- **Fonds 1-20**: Images personnalisées depuis `assets/fonds/`

### Formats Supportés
- `.jpg`
- `.jpeg`
- `.png`

### Ajout de Nouveaux Fonds
1. Placez vos images dans `assets/fonds/`
2. Nommez-les: `1.jpg`, `2.jpg`, `3.jpg`, etc.
3. Le système détecte automatiquement jusqu'à 20 fonds
4. La préférence est sauvegardée dans localStorage

### Détection Automatique
- Teste tous les formats pour chaque numéro
- Utilise le premier format trouvé
- Logs dans la console (F12): `Fonds disponibles: [0, 1, 2, 3]`

### Debug
Si les images ne se chargent pas:
1. Ouvrez la console (F12)
2. Vérifiez les logs: `Fonds disponibles` et `Image chargée`
3. Vérifiez l'onglet Network pour les erreurs 404
4. Assurez-vous que les chemins sont corrects: `assets/fonds/N.jpg`

## 🎵 Musique de Fond

### Contrôles
- **Fichier**: `assets/audio/musique.mp3`
- **Bouton**: 🔊/🔇 en bas à droite
- **Volume**: 0.3 (30%)
- **Loop**: Oui
- **Démarrage**: À la page de connexion

### Autoplay
Si le navigateur bloque l'autoplay, la musique démarre au premier clic.

## 🏆 Podium Doré (#1 Leaderboard)

Le premier joueur du classement a un style spécial:
- **Gradient doré animé** (4 secondes)
- **Pulse d'ombre** (2 secondes)
- **Bordure scintillante** (3 secondes)
- Animations fluides en boucle

## 🎨 Effets Visuels ALL IN

### Classes CSS
```css
body.bg-all-in-pending   /* Rouge pulsant pendant le spin */
body.bg-all-in-win       /* Flash vert sur victoire */
body.bg-all-in-loss      /* Flash rouge sur défaite */
```

### Animations
- **Pending**: Pulsation 1.5s (10%-25% opacité rouge)
- **Win**: Flash vert 0.6s (50%→0% opacité)
- **Loss**: Flash rouge 0.8s (60%→0% opacité)

## 📊 Système de Mise

### Niveaux de Mise
- **0**: Pas de mise (gain de base uniquement)
- **10, 20, 50**: Paliers initiaux
- **Au-delà**: Double à chaque niveau (100, 200, 400...)

### Multiplicateurs de Mise
- **Produit des raretés × mise** = bonus
- 50% chance de gain supplémentaire (+50% à +150%)
- 50% chance de perte (-30% à -70%)
- Seuils: Perte ≤ 10, Neutre ≤ 50, Gain > 50

## 🔧 Raccourcis Clavier

- **Touche 0**: Force la synchronisation Firebase (robions + cartes)

## 📱 Responsive

- Design adaptatif pour mobiles/tablettes
- Boutons repositionnés selon la taille d'écran
- Animations optimisées pour tous les appareils

---

**Version**: 2.0  
**Dernière mise à jour**: Janvier 2025
