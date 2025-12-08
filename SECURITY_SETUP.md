# 🔒 Guide de Sécurisation Firebase

## Mesures de Sécurité Implémentées

### 1. ✅ Firebase Authentication (Email/Password)
- **Authentification obligatoire** : Tous les utilisateurs doivent créer un compte avec email + password
- **UID unique** : Chaque utilisateur a un UID Firebase unique stocké dans `userId`
- **Protection des données** : Les utilisateurs ne peuvent accéder qu'à leurs propres données

### 2. ✅ Protection Anti-Cheat Console
- **Checksum validation** : Les robions sont protégés par un hash de validation
- **Stack trace analysis** : Détection des modifications depuis la console
- **Restauration automatique** : Les robions modifiés illégalement sont restaurés

### 3. ✅ Règles Firestore Sécurisées
Le fichier `firestore.rules` contient les règles de sécurité Firebase.

**Ce qui est bloqué :**
- ❌ Accès sans authentification Firebase
- ❌ Lecture des données d'autres utilisateurs
- ❌ Modification des données d'autres utilisateurs  
- ❌ Modification du userId après création
- ❌ Robions négatifs

**Ce qui est autorisé :**
- ✅ Lecture de ses propres données uniquement
- ✅ Mise à jour de ses propres données avec validation
- ✅ Gains importants (pas de limite supérieure de robions)

## 📋 Installation des Règles Firebase

### Étape 1 : Activer Firebase Authentication
1. Aller sur https://console.firebase.google.com/
2. Sélectionner votre projet
3. Menu "Authentication" → Onglet "Sign-in method"
4. Activer **"Email/Password"** (cocher "Email/password" et cliquer sur "Enregistrer")

### Étape 2 : Publier les Règles Firestore
1. Menu "Firestore Database" → Onglet "Règles"
2. Copier le contenu du fichier `firestore.rules` et le coller dans l'éditeur Firebase
3. Cliquer sur "Publier" pour activer les règles

### Étape 3 : (Optionnel) Migrer les Comptes Existants
Si des utilisateurs existent déjà avec l'ancien système pseudo/password :
1. Ils devront créer un nouveau compte avec une adresse email
2. Leurs anciennes données ne seront pas migrées automatiquement
3. Vous pouvez contacter Firebase Support pour une migration manuelle si nécessaire

## 🛡️ Tests de Sécurité

### Test 1 : Console Cheat
```javascript
// Dans la console : CECI NE MARCHERA PLUS
window.robions = 999999; // ❌ Bloqué par stack trace
robions = 999999; // ❌ Bloqué par stack trace
```

### Test 2 : Firebase Direct Access (Sans Authentification)
```javascript
// Tentative de lecture sans être connecté
await getDoc(doc(db, 'users', 'some-user-id')); // ❌ Permission denied (auth required)
```

### Test 3 : Accès aux Données d'un Autre Utilisateur
```javascript
// Tentative de lecture des données d'un autre user (même authentifié)
await getDoc(doc(db, 'users', 'autre-pseudo')); // ❌ Permission denied (userId mismatch)
```

### Test 4 : Modification du userId
```javascript
// Tentative de changer son userId
await setDoc(doc(db, 'users', userId), { 
  userId: 'another-uid'
}, { merge: true }); // ❌ Rejeté (userId immutable)
```

## 🔧 Fonctionnement Normal

Le jeu continue de fonctionner normalement :
- ✅ Gains/pertes au spin
- ✅ Sauvegarde automatique
- ✅ Synchronisation Firebase
- ✅ Leaderboard

Les robions sont maintenant manipulés via `setRobions()` au lieu de `robions =`.

## ⚠️ Note Importante

**Authentication Required**: Les règles Firebase nécessitent que l'utilisateur soit authentifié. Assurez-vous que votre système d'authentification fonctionne correctement avant de déployer les règles.
