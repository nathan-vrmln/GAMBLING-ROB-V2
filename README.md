# Mini Slot Machine (Robions)

Projet ultra minimaliste : machine à sous à 3 colonnes, crédits "robions", calcul de gains basé sur les valeurs attribuées aux images.

## 1. Structure
```
assets/
	img/
		slots/          <- Placez vos images (PNG, JPG, etc.)
	css/
		style.css
	js/
		slotmachine.js
		game.js
		ui.js
index.html
README.md
```

## 2. Ajout des images
Placez vos fichiers dans `assets/img/slots/`.
Ensuite, éditez `assets/js/game.js` et remplacez la liste :
```js
imageFilenames = ['imageA.png', 'imageB.png', 'imageC.png'];
```
par vos noms exacts de fichiers, par exemple :
```js
imageFilenames = ['cerise.png', 'diamond.png', 'seven.png'];
```
La valeur (1..10) de chaque image est calculée de manière déterministe à partir du nom du fichier (hash simple des caractères), garantissant toujours la même valeur pour un même nom.

## 3. Logique des gains
Après un spin, on obtient un tableau de 3 noms d'images.

| Résultat                | Gain                              |
|-------------------------|------------------------------------|
| 3 images identiques     | (somme des 3 valeurs) × 16         |
| 2 images identiques     | (somme des 3 valeurs) × 8          |
| Aucune répétition       | 0                                 |

Les crédits `robions` augmentent du gain (aucun coût de spin dans cette version). Vous pouvez ajouter un coût en modifiant `applySpinResult()` dans `game.js` si nécessaire.

## 4. Fonctionnement
`slotmachine.js` anime les 3 colonnes en changeant rapidement d'image puis en ralentissant avec arrêt décalé (effet basique).
`game.js` gère les crédits, valeurs de chaque image et le calcul des gains.
`ui.js` crée les colonnes si elles n'existent pas et relie le bouton SPIN.

## 5. Lancement local
Ouvrez le dossier du projet dans VS Code puis utilisez une extension type "Live Server" ou servez le répertoire avec un petit serveur HTTP.

Exemple avec Python (si installé) :
```bash
python -m http.server 8080
```
Puis ouvrez : http://localhost:8080

Sur Windows PowerShell (sans Python) vous pouvez installer rapidement un serveur Node (si Node présent) :
```powershell
npm install -g serve; serve -p 8080
```

## 6. Personnalisation rapide
- Modifier la vitesse des spins dans `slotmachine.js` (constantes `INITIAL_INTERVAL`, `SLOW_INTERVAL`, etc.).
- Ajouter un coût par spin : dans `applySpinResult()` retirer un nombre fixe à `robions` avant d'ajouter le gain.
- Ajuster le style dans `style.css` (couleurs, tailles, typo).

## 7. Manifest automatique (ajout d'images sans modifier le code)
- Un fichier `assets/img/manifest.json` contient la liste des images à utiliser.
- Au chargement, le jeu lit automatiquement ce manifest. Si absent, il utilise une liste de secours interne.

Pour régénérer le manifest après avoir ajouté/supprimé des images, exécutez sous Windows PowerShell:
```powershell
scripts/generate-manifest.ps1
```
Le manifest est trié automatiquement. Les noms avec espaces/accents sont supportés.

## 8. Étapes futures possibles
- Effets sonores simples (spin / gain).
- Ajout d'un coût par spin et d'un bouton "Recharger" avec limite.
- Animation plus fluide (canvas ou spritesheet).
- Table de paiement détaillée / historique des spins.

Bon jeu !

