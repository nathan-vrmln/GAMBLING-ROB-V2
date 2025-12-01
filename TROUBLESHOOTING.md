# 🎰 Gambling Made - Guide de Dépannage

## ⚠️ Problème: Les Fonds d'Écran Ne Se Chargent Pas

Si vous rencontrez des problèmes de chargement des images de fond, suivez ces étapes:

### 1. Vérification Console (F12)

Ouvrez la console développeur (F12) et cherchez:
```
Fonds disponibles: [0, 1, 2, 3]
Extensions: {1: "jpg", 2: "jpg", 3: "jpg"}
```

Si vous voyez seulement `[0]`, les images ne sont pas détectées.

### 2. Vérification des Fichiers

Assurez-vous que vos fichiers existent dans le bon dossier:
```
assets/
  fonds/
    1.jpg    ✅
    2.jpg    ✅
    3.jpg    ✅
    ...
```

**Formats supportés**: `.jpg`, `.jpeg`, `.png`

### 3. Vérification Réseau

1. Ouvrez F12 → Onglet **Network**
2. Cliquez sur le bouton 🌄
3. Cherchez les requêtes vers `assets/fonds/`
4. Si vous voyez des erreurs **404** ou **CORS**, c'est un problème de serveur

### 4. Solutions

#### Solution A: Serveur Local HTTP

Le jeu doit être servi par un serveur HTTP, pas ouvert directement (`file://`).

**Windows PowerShell**:
```powershell
cd "c:\Users\natha\Documents\ECOLE\2025-2026\CODAGE\CODAGE20252026\GAMBLING MADE"
python -m http.server 8000
```

Puis ouvrez: `http://localhost:8000`

**Alternative Node.js**:
```powershell
npx http-server -p 8000
```

#### Solution B: Extension VS Code

Si vous utilisez VS Code:
1. Installez **Live Server**
2. Clic droit sur `index.html`
3. Sélectionnez **"Open with Live Server"**

#### Solution C: XAMPP/WAMP

Placez le dossier dans:
- **XAMPP**: `C:\xampp\htdocs\gambling-made\`
- **WAMP**: `C:\wamp64\www\gambling-made\`

Accédez via: `http://localhost/gambling-made/`

### 5. Cache Navigateur

Si les modifications ne s'affichent pas:
1. Ouvrez F12
2. Faites **Ctrl + Shift + R** (hard refresh)
3. Ou: F12 → Onglet Network → Cochez **"Disable cache"**

### 6. Test Rapide

Dans la console (F12), exécutez:
```javascript
fetch('assets/fonds/1.jpg')
  .then(r => console.log('Statut:', r.status, r.ok ? '✅' : '❌'))
  .catch(e => console.error('Erreur:', e))
```

- **200 OK ✅**: L'image existe et est accessible
- **404 ❌**: Fichier introuvable
- **CORS ❌**: Problème de serveur

### 7. Chemin Relatif

Le jeu utilise des chemins relatifs. Assurez-vous que:
```
index.html                    (racine)
assets/
  fonds/
    1.jpg                     (✅ bon chemin)
  
❌ MAUVAIS:
fonds/1.jpg                   (hors du dossier assets)
assets/images/fonds/1.jpg     (mauvais sous-dossier)
```

## 🎵 Problème: Musique Ne Démarre Pas

### Autoplay Bloqué

Les navigateurs modernes bloquent l'autoplay audio. Solution:
- La musique démarre au **premier clic** dans la page
- Ou utilisez le bouton mute 🔊 pour forcer le démarrage

### Fichier Manquant

Vérifiez:
```
assets/
  audio/
    musique.mp3    ✅
```

## 🔊 Volume Trop Fort/Faible

Modifiez dans `index.html` (ligne ~178):
```javascript
bgm.volume = 0.3;  // 0.0 (muet) à 1.0 (max)
```

## 🎨 Problème: Effets ALL IN Ne Fonctionnent Pas

### Vérifications

1. **Console (F12)**: Cherchez des erreurs JavaScript
2. **Classe CSS**: Vérifiez que `body` a bien la classe ajoutée pendant le spin
3. **Z-index**: Les overlays utilisent `z-index: 9999`

### Test Manuel

Dans la console:
```javascript
// Test effet rouge
document.body.classList.add('bg-all-in-pending');

// Test effet vert
document.body.classList.add('bg-all-in-win');

// Test effet rouge perte
document.body.classList.add('bg-all-in-loss');

// Nettoyer
document.body.classList.remove('bg-all-in-pending', 'bg-all-in-win', 'bg-all-in-loss');
```

## 🐛 Autres Problèmes

### Firebase Non Connecté

Symptômes: Données ne se sauvegardent pas

Solution:
1. Vérifiez votre clé API Firebase
2. Vérifiez les règles Firestore
3. Console: Cherchez les erreurs Firebase

### Boutons Ne Répondent Pas

1. Vérifiez la console pour erreurs JS
2. Assurez-vous que `game.js` est chargé
3. Vérifiez `window.GameLogic` existe:
   ```javascript
   console.log(window.GameLogic);  // doit afficher un objet
   ```

### Mise Impossible

- Vérifiez que vous avez assez de robions
- Le bouton ALL IN met la mise = tous vos robions
- Si robions = 0, impossible de miser

## 📞 Support

Si le problème persiste:
1. Ouvrez F12 → Console
2. Copiez TOUS les messages d'erreur (en rouge)
3. Partagez les captures d'écran

---

**Astuce**: Gardez toujours F12 ouvert pendant le développement pour voir les logs et erreurs en temps réel!
