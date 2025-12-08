// game.js
// Gestion du slot machine: système de gains, mises, combos et effets visuels/audio

// ===== CACHE DOM (optimisation performance) =====
let __cachedDOM = {};
function getCachedElement(id) {
	if (!__cachedDOM[id]) {
		__cachedDOM[id] = document.getElementById(id);
	}
	return __cachedDOM[id];
}

// ===== VARIABLES GLOBALES =====
let robions = 0; // crédits de départ par défaut

// Sécurité anti-cheat : sceller robions avec validation
let __robionsChecksum = 0;
function __updateChecksum() {
	__robionsChecksum = robions * 7919 + 31337; // Hash simple
}
function __validateRobions() {
	const expected = robions * 7919 + 31337;
	if (__robionsChecksum !== expected) {
		console.error('[ANTI-CHEAT] Robions modifiés illégalement détectés!');
		// Restaurer depuis localStorage
		const stored = localStorage.getItem('robions');
		if (stored) {
			robions = parseInt(stored, 10) || 0;
			__updateChecksum();
		}
		return false;
	}
	return true;
}

// Exposer robions sur window avec protection anti-modification
Object.defineProperty(window, 'robions', {
	get: () => {
		__validateRobions();
		return robions;
	},
	set: (val) => {
		// Bloquer modifications directes depuis console
		const stack = new Error().stack;
		if (stack && !stack.includes('game.js') && !stack.includes('ui.js')) {
			console.warn('[ANTI-CHEAT] Tentative de modification robions bloquée');
			return;
		}
		robions = val;
		__updateChecksum();
	}
});

// Fonction interne sécurisée pour changer robions
function setRobions(newValue) {
	robions = newValue;
	__updateChecksum();
	if (window.updateRobionsDisplay) window.updateRobionsDisplay();
}

// ===== SYSTÈME DE MUSAIN =====
let musainMultiplier = 1;
let musainTimeRemaining = 0;
let musainInterval = null;
let musainSpawnerInterval = null;
const MUSAIN_IMG_PATH = 'assets/images/musain.png';
const MUSAIN_BOOST_DURATION = 20; // 20 secondes
const MUSAIN_FALL_DURATION = 4000; // 4 secondes pour tomber
const MUSAIN_AUTO_SPAWN_MIN = 5000; // 5 sec minimum (TEST)
const MUSAIN_AUTO_SPAWN_MAX = 8000; // 8 sec maximum (TEST)

function spawnMusain() {
	const musainEl = document.createElement('img');
	musainEl.src = MUSAIN_IMG_PATH;
	musainEl.className = 'musain-falling';
	musainEl.style.position = 'fixed';
	musainEl.style.left = Math.random() * (window.innerWidth - 80) + 'px';
	musainEl.style.top = '0px';
	musainEl.style.width = '80px';
	musainEl.style.height = '80px';
	musainEl.style.cursor = 'pointer';
	musainEl.style.zIndex = '99999';
	musainEl.style.pointerEvents = 'auto';
	
	document.body.appendChild(musainEl);
	
	// Animation de chute simple
	let startTime = Date.now();
	const fallAnimation = setInterval(() => {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / MUSAIN_FALL_DURATION, 1);
		const newTop = progress * (window.innerHeight + 100);
		
		musainEl.style.top = newTop + 'px';
		
		if (progress >= 1) {
			clearInterval(fallAnimation);
			musainEl.remove();
			scheduleNextMusainSpawn(); // Programmer le prochain
		}
	}, 30);
	
	// Clic sur le musain
	musainEl.addEventListener('click', (e) => {
		e.stopPropagation();
		// Jouer le son musain
		if (window.musainSound) {
			window.musainSound.currentTime = 0;
			window.musainSound.play().catch(() => {});
		}
		activateMusainBoost();
		clearInterval(fallAnimation);
		musainEl.remove();
		scheduleNextMusainSpawn();
	});
}

function activateMusainBoost() {
	musainMultiplier = 2;
	musainTimeRemaining = MUSAIN_BOOST_DURATION;
	updateMusainDisplay();
	
	if (musainInterval) clearInterval(musainInterval);
	musainInterval = setInterval(() => {
		musainTimeRemaining--;
		updateMusainDisplay();
		
		if (musainTimeRemaining <= 0) {
			musainMultiplier = 1;
			clearInterval(musainInterval);
			musainInterval = null;
			updateMusainDisplay();
		}
	}, 1000);
}

function updateMusainDisplay() {
	const display = document.getElementById('musain-timer');
	if (display) {
		if (musainTimeRemaining > 0) {
			display.textContent = `×${musainMultiplier} ${musainTimeRemaining}s`;
			display.style.display = 'block';
		} else {
			display.style.display = 'none';
		}
	}
	if (window.updateRobionsDisplay) window.updateRobionsDisplay();
}

function scheduleNextMusainSpawn() {
	if (musainSpawnerInterval) clearTimeout(musainSpawnerInterval);
	// Spawn aléatoire entre 40-80 secondes
	const delay = Math.random() * (MUSAIN_AUTO_SPAWN_MAX - MUSAIN_AUTO_SPAWN_MIN) + MUSAIN_AUTO_SPAWN_MIN;
	console.log(`[MUSAIN] Scheduling spawn in ${delay}ms`);
	musainSpawnerInterval = setTimeout(() => {
		console.log(`[MUSAIN] Timeout fired! Spawning...`);
		spawnMusain();
	}, delay);
}

window.getMusainMultiplier = () => musainMultiplier;
window.getMusainTimeRemaining = () => musainTimeRemaining;

let imageFilenames = [];
let imageMetaMap = {}; // { filename: { rarity, displayName, persons:[], adjective } }
let isSpinning = false; // état pour empêcher spam
let resultSound = null; // audio pour fin de spin
let raritySounds = {}; // sons par rareté
let comboSounds = {}; // sons pour combos
let unlockedCards = new Set(); // cartes débloquées
let allInSound = null; // son pour ALL IN
let isFirstSpinAfterConnection = true; // bloque ALL IN pour le 1er spin
let comboStreak = 0; // compteur de streaks de combos
let isAllInActive = false; // vrai après ALL IN, jusqu'au spin suivant
let selectedAvatar = null; // Photo de profil sélectionnée
let biggestAllIn = 0; // Plus gros ALL IN réalisé par le joueur

// ===== CONFIGURATION SYSTÈME DE MISE =====
let bet = 0; // mise actuelle (stakes: 0,10,20,50,100,200,400...)
const STAKE_LEVELS = [0, 10, 20, 50]; // puis doublement après 50
// 3c=0.125 (perte), 1r+2c=0.3 (remboursé), 1é+2c=0.6 (gain), 2r+1c=0.72 (gain), tout le reste=gain
const RARITY_STAKE_MULTIPLIERS = {
	0: 1.0,   // Denis (malus, 10% des cartes)
	1: 0.5,   // commun (43.9% des cartes)
	2: 1.2,   // rare (22.9% des cartes)
	3: 2.4,   // épique (18.5% des cartes)
	4: 3.0,   // légendaire (12.7% des cartes)
	5: 10.0   // mythique (1.3% des cartes)
};
const LOSS_THRESHOLD = 0.125;
const NEUTRAL_THRESHOLD = 0.5;

// ===== SYSTÈME DE MALUS DENIS =====
let denisCount = 0; // nombre de Denis dans le tirage actuel
let denisEffect = null; // { type: 'loss'|'percent', value: perte } ou null

// ===== LISTE D'IMAGES PAR DÉFAUT (depuis imgV2) =====
const defaultImageFilenames = ["abel bebe bebes 1.png","abel caillou caillou 2.png","abel cheveux humainbizarre 1.png","abel classe classe 1.png","abel cromagnon caillou 1.png","abel dessin dessins 3.png","abel dessinrose dessins 2.png","abel dodo dodo 1.png","abel femme sexy 4.png","abel giraffe humainbizarre 1.png","abel glitche humainbizarre 1.png","abel gris meme 1.png","abel mannequin gigachad 2.png","abel marcel sportifs 1.png","abel retourne humainbizarre 2.png","abel rio snap 2.png","abel robion rob 1.png","abel roi meme 2.png","abel sexe sexy 2.png","abel sunglass vacances 1.png","abel velo velo 2.png","abel webcam numerique 1.png","abel-charlie-mateo cordemerde groupes 1.png","abel-corentin-noa-mateo alapause groupes 2.png","abel-mael-charlie-mateo gangbites groupes 1.png","abel-mael-nathan film cinema 4.png","abel-noa-corentin-charlie conferencedemerde groupes 2.png","abel-noa-mael branquignolles groupes 1.png","angelo artiste oeuvres 2.png","angelo bebe bebes 1.png","angelo binouze alcoliques 1.png","angelo caillou caillou 3.png","angelo classe classe 1.png","angelo dodo1 dodo 1.png","angelo dodo2 dodo 2.png","angelo drip gigachad 1.png","angelo fisc gigachad 3.png","angelo glouglou bouffe 1.png","angelo japanesegirls sexy 5.png","angelo multivers humainbizarre 3.png","angelo robion rob 1.png","angelo-corentin film cinema 4.png","charlie bebesylvainrob bebes 2.png","charlie bitmoji humainbizarre 2.png","charlie classe classe 1.png","charlie croco 3.jpg","charlie dessin dessins 3.png","charlie fortnite model3d 3.png","charlie gida bouffe 1.png","charlie lockin gigachad 2.png","charlie paparazzi paparazzis 1.png","charlie sybau meme 4.png","charlie taga 3.jpg","charlie twin humainbizarre 2.png","charlie vodkprod paparazzis 4.jpg","charlie-abel soireenoa groupes 1.png","charlie-sleyze cantine groupes 1.png","corentin artiste oeuvres 2.png","corentin bebepirate bebes 4.png","corentin classe classe 1.png","corentin corenthiens oeuvres 3.png","corentin djelaba religieux 2.png","corentin gourmand bouffe 1.png","corentin hazborentin bebes 4.png","corentin judo sportifs 4.png","corentin minimoys oeuvres 3.png","corentin nasdass1 snap 1.png","corentin nasdass2 snap 3.png","corentin paparazzi paparazzis 1.png","corentin robion rob 2.png","corentin steeve humainbizarre 2.jpg","corentin zob toilettes 2.png","corentin-noa-angelo-charlie-mael journeesrobouvertes groupes.png","denis 0.png","jules goat 3.jpg","mael 3D model3d 4.png","mael agora humainbizarre 2.jpg","mael artiste oeuvres 1.png","mael buzzcut humainbizarre 1.png","mael chad gigachad 1.png","mael chauve meme 2.png","mael classe classe 1.png","mael film cinema 4.png","mael freaky1 freaky 3.png","mael freaky2 freaky 1.png","mael goat gigachad 4.png","mael granini bouffe 3.png","mael grobion oeuvres 3.png","mael indien snap 1.png","mael ipadkid humainbizarre 1.png","mael louche humainbizarre 1.png","mael nu toilettes 1.png","mael pascontent snap 1.png","mael pdp oeuvres 4.png","mael porfolio model3d 4.png","mael retourne humainbizarre 3.png","mael robion rob 1.png","mael sigma gigachad 2.png","mael soiree alcoliques 1.png","mael webcam numerique 1.png","mael-charlie fusion humainbizarre 3.png","mael-mateo agora groupes 2.png","mateo alcool alcoliques 1.png","mateo bateau vacances 1.png","mateo beaugosse gigachad 1.png","mateo bkaka1 toilettes 2.png","mateo bkaka2 toilettes 2.png","mateo booking vacances 1.png","mateo caillou caillou 1.png","mateo classe classe 1.png","mateo coupe humainbizarre 1.png","mateo cromagnon caillou 1.png","mateo cv numerique 3.png","mateo dessin dessins 3.png","mateo dodo dodo 3.png","mateo flex gigachad 1.png","mateo freaky freaky 4.png","mateo glouglou bouffe 2.png","mateo marcel sportifs 1.png","mateo matrix numerique 3.png","mateo meuf sexy 1.png","mateo nucaca toilettes 4.png","mateo ia vacances 3.png","mateo robion rob 1.png","mateo stonks meme 3.png","mateo veloganzhou velo 1.png","mateo voleur snap 2.png","mateo-abel-noa redbullcar groupes 2.png","mateo-charlie film cinema 4.png","mateo-charlie-abel cordemais 3.jpg","mateo-mael keskifait groupes 2.png","mathis rip caillou 4.png","nathan classe classe 1.png","nathan dessin dessins 3.png","nathan fesse sexy 2.png","nathan jesus religieux 4.png","nathan mateo humainbizarre 1.png","nathan trentemoult vacances 3.png","noa aurafarm gigachad 1.png","noa classe classe 1.png","noa daronne meme 3.png","noa dodo dodo 2.png","noa goat toilettes 1.png","noa kipa religieux 3.png","noa paparazzi paparazzis 2.png","noa prince clash 3.png","noa robion rob 2.png","noa rouge meme 1.png","noa sunglass vacances 1.png","noa velo velo 3.png","noa-abel branquignolles groupes 1.png","noa-abel-mateo-sleyze gang groupes 1.png","noa-mael tdl groupes 1.png","noa-mael-charlie branquignolles groupes 1.png","tom fesse sexy 4.png","tom molosse clash 4.png","tom tobomrobion rob 5.png","tom velo velo 2.png"];

// ===== UTILITAIRES =====
const allowedExt = ['.png','.jpg','.jpeg','.gif','.webp'];
function hasAllowedExt(name){
	const lower = name.toLowerCase();
	return allowedExt.some(ext => lower.endsWith(ext));
}

// Formater les nombres avec espaces tous les 3 chiffres
function formatNumber(num) {
	return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ===== SYSTÈME DE MISE =====
// Nouveau système simple : somme des raretés
const RARITY_WIN_VALUES = {
	0: -100, // Denis (malus très négatif, trigger les pénalités)
	1: 0,    // commun
	2: 1,    // rare
	3: 2,    // épique
	4: 10,   // légendaire
	5: 50    // mythique
};

function calculateWinStatus(resultArray) {
	let sum = 0;
	resultArray.forEach(fn => {
		const meta = imageMetaMap[fn];
		const rarity = meta?.rarity || 1;
		sum += (RARITY_WIN_VALUES[rarity] ?? 0);
	});
	// sum < 1 = perte, = 1 = remboursé, > 1 = gain
	return sum;
}

function calculateStakeMultiplier(resultArray) {
	let product = 1;
	resultArray.forEach(fn => {
		const meta = imageMetaMap[fn];
		const rarity = meta?.rarity || 1;
		product *= (RARITY_STAKE_MULTIPLIERS[rarity] ?? 1);
	});
	return product;
}

function applyStake(stake, multiplier, forceRefund = false) {
	if (stake === 0 || forceRefund) {
		return { refund: stake, bonus: 0, net: 0, lost: false };
	}
	if (multiplier <= LOSS_THRESHOLD) {
		return { refund: 0, bonus: 0, net: -stake, lost: true };
	} else if (multiplier <= NEUTRAL_THRESHOLD) {
		return { refund: stake, bonus: 0, net: 0, lost: false };
	} else {
		const bonus = Math.floor(stake * multiplier);
		return { refund: stake, bonus, net: bonus, lost: false };
	}
}

// ===== PARSING MÉTADONNÉES IMAGES =====
// Nouvelle nomenclature: nom(s) adjectif famille rareté
function parseImageMeta(filename) {
	const noExt = filename.replace(/\.[^.]+$/, '');
	const parts = noExt.split(/\s+/).filter(Boolean);
	
	// La rareté est toujours le dernier token (0-5 décimal)
	let rarity = 3; // défaut
	if (parts.length > 0) {
		const lastPart = parts[parts.length - 1];
		const r = parseInt(lastPart, 10);
		if (Number.isInteger(r) && r >= 0 && r <= 5) {
			rarity = r;
			parts.pop(); // Retirer la rareté de la liste
		}
	}
	
	// Structure: nom(s) adjectif famille
	// On affiche seulement: nom(s) + rareté (famille est ignorée)
	let persons = [];
	let adjective = null;
	let family = null;
	
	if (parts.length > 0) {
		// Premier token: noms (peut avoir des tirets)
		persons = parts[0].split('-').filter(Boolean);
	}
	if (parts.length > 1) {
		// Deuxième token: adjectif
		adjective = parts[1];
	}
	if (parts.length > 2) {
		// Troisième token: famille (stockée mais pas affichée)
		family = parts[2];
	}
	
	// displayName: noms + adjectif (pas famille)
	const displayName = [persons.join('-'), adjective].filter(Boolean).join(' ')
		|| noExt;
	
	return { rarity, displayName, persons, adjective, family };
}

function rarityToWeight(r) {
	switch (r) {
		case 0: return 1000;  // Denis (double fréquence)
		case 1: return 500;
		case 2: return 300;
		case 3: return 100;
		case 4: return 10;
		case 5: return 1;
		default: return 100;
	}
}

// Récompenses par rareté: 0→malus, 1→1, 2→2-3, 3→40-60, 4→400, 5→10000
function rewardForRarity(r) {
	switch (r) {
		case 0: return 0; // Denis ne donne pas de robions, c'est un malus
		case 1: return 1;
		case 2: return 2 + Math.floor(Math.random() * 2);
		case 3: return 40 + Math.floor(Math.random() * 21);
		case 4: return 400;
		case 5: return 10000;
		default: return 0;
	}
}

// ===== INITIALISATION =====
async function initGame() {
	setSpinButtonEnabled(false);
	// Marquer qu'une synchronisation est souhaitée au tout premier spin après (re)connexion
	window.forceSyncPending = true;
	resultSound = new Audio('assets/audio/realcoin.wav');
	resultSound.preload = 'auto';
	// Baisse légère du son de résultat pour mettre en valeur les annonces (+30% perçues)
	try { resultSound.volume = 0.7; } catch(e) {}
	raritySounds = {
		2: new Audio('assets/audio/rare.mp3'),
		3: new Audio('assets/audio/epic.mp3'),
		4: new Audio('assets/audio/legendary.mp3'),
		5: new Audio('assets/audio/mythical.mp3')
	};
	Object.values(raritySounds).forEach(s => { s.preload = 'auto'; try { s.volume = 1.0; } catch(e) {} });
	comboSounds = {
		bigwin: new Audio('assets/audio/bigwin.mp3'),
		cash: new Audio('assets/audio/cash.mp3'),
		win2: new Audio('assets/audio/win2.wav'),
		sameFamily: new Audio('assets/audio/same-family.mp3'),
		tripleRare: new Audio('assets/audio/triple-rare.mp3'),
		tripleEpic: new Audio('assets/audio/triple-epic.mp3')
	};
	Object.values(comboSounds).forEach(s => { s.preload = 'auto'; try { s.volume = 1.0; } catch(e) {} });
	// Son ALL IN
	try {
		allInSound = new Audio('assets/audio/allin.mp3');
		allInSound.preload = 'auto';
		allInSound.volume = 1.0;
	} catch(e) { allInSound = null; }
	// Sons win/loss + family complete
	let winAllInSound = null, winNormalSound = null, lossAllInSound = null, lossNormalSound = null, familyCompleteSound = null;
	try {
		winAllInSound = new Audio('assets/audio/tresbon-tirage.mp3');
		winAllInSound.preload = 'auto';
		winAllInSound.volume = 1.0;
	} catch(e) {}
	try {
		winNormalSound = new Audio('assets/audio/win2.mp3');
		winNormalSound.preload = 'auto';
		winNormalSound.volume = 1.0;
	} catch(e) {}
	try {
		lossAllInSound = new Audio('assets/audio/loose2.wav');
		lossAllInSound.preload = 'auto';
		lossAllInSound.volume = 1.0;
	} catch(e) {}
	try {
		lossNormalSound = new Audio('assets/audio/loose1.wav');
		lossNormalSound.preload = 'auto';
		lossNormalSound.volume = 0.6; // Réduit de 40% (1.0 * 0.6 = 0.6)
	} catch(e) {}
	try {
		familyCompleteSound = new Audio('assets/audio/family-complete.mp3');
		familyCompleteSound.preload = 'auto';
		familyCompleteSound.volume = 1.0;
	} catch(e) {}
	let denisScareSound = null;
	try {
		denisScareSound = new Audio('assets/audio/scare.mp3');
		denisScareSound.preload = 'auto';
		denisScareSound.volume = 1.0; // Max (déjà au max, +70% atteint la limite)
	} catch(e) {}
	let musainSound = null;
	try {
		musainSound = new Audio('assets/audio/musain.mp3');
		musainSound.preload = 'auto';
		musainSound.volume = 1.0;
	} catch(e) {}
	window.denisScareSound = denisScareSound;
	window.musainSound = musainSound;
	window.winAllInSound = winAllInSound;
	window.winNormalSound = winNormalSound;
	window.lossAllInSound = lossAllInSound;
	window.lossNormalSound = lossNormalSound;
	window.familyCompleteSound = familyCompleteSound;
	const personNames = ['abel','corentin','mael','mateo','nathan','noa'];
	personNames.forEach(name => {
		const audio = new Audio(`assets/audio/triple/${name}.mp3`);
		audio.preload = 'auto';
		comboSounds[`triple_${name}`] = audio;
		try { audio.volume = 1.0; } catch(e) {}
	});
	imageFilenames = defaultImageFilenames.slice();
	try {
		// On file://, fetch may be blocked by CORS; keep silent fallback
		const res = await fetch('assets/imgV2/manifest.json', { cache: 'no-store' });
		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data)) {
				const filtered = data.filter(hasAllowedExt);
				if (filtered.length > 0) imageFilenames = filtered;
			}
		}
	} catch (e) {
		// Fallback: leave defaultImageFilenames and avoid console noise in file context
	}

	const weights = {};
	imageMetaMap = {};
	imageFilenames.forEach(fn => {
		const meta = parseImageMeta(fn);
		imageMetaMap[fn] = meta;
		weights[fn] = rarityToWeight(meta.rarity);
	});
	
	// DEBUG: Afficher les familles et Denis une fois au chargement
	const families = new Set();
	let denisCount = 0;
	let denisTotalWeight = 0;
	imageFilenames.forEach(fn => {
		const family = imageMetaMap[fn]?.family;
		if (family) families.add(family);
		if (imageMetaMap[fn]?.rarity === 0) {
			denisCount++;
			denisTotalWeight += weights[fn];
		}
	});
	// Mettre à jour l'export global
	if (window.GameLogic) window.GameLogic.imageMetaMap = imageMetaMap;
	if (window.SlotMachine) {
		window.SlotMachine.setImages(imageFilenames);
		if (window.SlotMachine.setImageWeights) {
			window.SlotMachine.setImageWeights(weights);
		}
	}
	
	// Charger depuis les données utilisateur et recharger depuis Firebase pour garantir la fraîcheur des données
	if (window.userRobions !== undefined) {
		setRobions(window.userRobions);
		unlockedCards = new Set(window.userUnlockedCards || []);
		// Recharger immédiatement depuis Firebase pour avoir les dernières données
		await reloadGameData();
	}
	
	updateRobionsDisplay();
	setSpinButtonEnabled(true);

	// Wire boutons collection
	const openBtn = document.getElementById('open-collection-btn');
	const closeBtn = document.getElementById('close-collection-btn');
	const overlay = document.getElementById('collection-overlay');
	if (openBtn && overlay) {
		openBtn.addEventListener('click', async () => {
			// Recharger les données seulement si pas de déblocage récent (< 3 secondes)
			const timeSinceUnlock = window.lastUnlockTime ? (Date.now() - window.lastUnlockTime) : Infinity;
			if (timeSinceUnlock > 3000) {
				await reloadGameData();
			}
			overlay.style.display = 'block';
			openBtn.classList.add('hidden');
			renderCollection();
			// Mettre à jour le titre avec le bonus
			const headerTitle = overlay.querySelector('.collection-header h2');
			if (headerTitle) {
			const bonusPercent = unlockedCards.size * 10;
			if (bonusPercent > 0) {
				headerTitle.innerHTML = `Collection <span style="color:#22c55e;font-size:0.85em;">(Bonus collection: +${bonusPercent}%)</span>`;
				} else {
					headerTitle.textContent = 'Collection';
				}
			}
		});
	}
	if (closeBtn && overlay && openBtn) {
		closeBtn.addEventListener('click', () => {
			overlay.style.display = 'none';
			openBtn.classList.remove('hidden');
			const headerTitle = overlay.querySelector('.collection-header h2');
			if (headerTitle) {
				const bonusPercent = unlockedCards.size * 10;
				if (bonusPercent > 0) {
					headerTitle.innerHTML = `Collection <span style="color:#22c55e;font-size:0.85em;">(+${bonusPercent}%)</span>`;
				} else {
					headerTitle.textContent = 'Collection';
				}
			}
		});
	}
	
	// Event listener pour le toggle de filtrage par famille
	const familyToggle = document.getElementById('collection-family-toggle');
	if (familyToggle) {
		familyToggle.addEventListener('change', () => {
			renderCollection();
		});
	}
}

// Fonction pour initialiser avec données Firebase
window.initGameWithUserData = function() {
	initGame();
	scheduleNextMusainSpawn(); // Démarrer le système auto-spawn Musain
};

// ===== DÉTECTION COMBOS =====
function detectTripleSamePerson(resultArray){
	if (!Array.isArray(resultArray) || resultArray.length !== 3) return null;
	const allPersons = resultArray.map(fn => (imageMetaMap[fn]?.persons || []).map(p => p.toLowerCase()));
	if (allPersons.some(list => list.length === 0)) return null;
	const first = Array.from(new Set(allPersons[0]));
	for (const person of first) {
		if (allPersons[1].includes(person) && allPersons[2].includes(person)) {
			return person;
		}
	}
	return null;
}

// Détecte TOUS les combos cumulables et renvoie une liste
function detectCombos(resultArray){
	const combos = [];
	if (!Array.isArray(resultArray) || resultArray.length !== 3) {
		return combos;
	}
	// Triple exact
	if (resultArray[0] === resultArray[1] && resultArray[1] === resultArray[2]) {
		combos.push({type:'triple_exact', multiplier:1000, label:'TRIPLE EXACT ×1000 !!!'});
	}
	// Double exact (au moins une paire)
	const counts = {};
	resultArray.forEach(fn => counts[fn] = (counts[fn] || 0) + 1);
	if (Object.values(counts).includes(2)) {
		combos.push({type:'double_exact', multiplier:30, label:'DOUBLE EXACT ×30 !!'});
	}
	// Triple personnage
	const triplePerson = detectTripleSamePerson(resultArray);
	if (triplePerson) {
		combos.push({type:'triple_person', multiplier:50, label:`TRIPLE ${triplePerson.toUpperCase()} ×50`, person:triplePerson});
	}
	// Triple famille (3 cartes de la même famille)
	const families = resultArray.map(fn => imageMetaMap[fn]?.family || null).filter(f => f);
	if (families.length === 3 && families[0] === families[1] && families[1] === families[2]) {
		const familyLabel = familyNames[families[0]] || families[0];
		combos.push({type:'triple_family', multiplier:15, label:`FAMILLE ${familyLabel} ×15`, family:families[0]});
	}
	// Triple rareté
	const rarities = resultArray.map(fn => imageMetaMap[fn]?.rarity || 1);
	if (rarities[0] === rarities[1] && rarities[1] === rarities[2]) {
		if (rarities[0] !== 1) {
			const rarityNames = {2:'RARE',3:'ÉPIQUE',4:'LÉGENDAIRE',5:'MYTHIQUE'};
			const multipliers = {2:10, 3:30, 4:100, 5:100};
			const mult = multipliers[rarities[0]] || 10;
			combos.push({type:'triple_rarity', multiplier:mult, label:`TRIPLE ${rarityNames[rarities[0]]} ×${mult}`, rarity:rarities[0]});
		}
	}
	return combos;
}

// ===== MISE À JOUR UI =====
function updateSlotVisuals(resultArray) {
	const wrappers = document.querySelectorAll('#slot-machine .slot-wrapper');
	const rarityColors = {
		1: '#000000',
		2: '#008cff',
		3: '#b400ff',
		4: '#ffb400',
		5: '#ffffff'
	};
	resultArray.forEach((filename, idx) => {
		const wrap = wrappers[idx];
		if (!wrap) return;
		const col = wrap.querySelector('.slot-column');
		if (!col) return;
		col.classList.remove('rarity-0','rarity-1','rarity-2','rarity-3','rarity-4','rarity-5');
		const meta = imageMetaMap[filename];
		const rarity = meta?.rarity || 3;
		// Force Denis en rarity 0 si son nom contient "denis"
		const isBenisCard = filename.includes('denis');
		if (isBenisCard) {
			col.classList.add('rarity-0');
		} else {
			col.classList.add('rarity-' + rarity);
		}
		col.classList.add('stopped');
		// Appliquer la couleur de bordure selon la rareté
		let borderColor = isBenisCard ? '#FF0000' : (rarityColors[rarity] || rarityColors[1]);
		col.style.borderImage = `linear-gradient(135deg, ${borderColor}, ${borderColor}) 1`;
		let overlay = col.querySelector('.neon-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.className = 'neon-overlay';
			col.appendChild(overlay);
		}
		overlay.className = 'neon-overlay neon-r' + rarity;
		const info = wrap.querySelector('.slot-info');
		if (info) {
			const nameSpan = info.querySelector('.slot-name');
			const raritySpan = info.querySelector('.slot-rarity');
			if (nameSpan) nameSpan.textContent = meta?.displayName || filename;
			if (raritySpan) {
				if (isBenisCard || rarity === 0) {
					raritySpan.textContent = '';
					raritySpan.className = 'slot-rarity rarity-0';
				} else {
					const rarityNames = {1:'commun',2:'rare',3:'épique',4:'légendaire',5:'mythique'};
					raritySpan.textContent = rarityNames[rarity] || '?';
					raritySpan.className = 'slot-rarity rarity-' + rarity;
				}
			}
		}
	});
}

function updateRobionsDisplay() {
	window.robions = robions; // Forcer la synchronisation
	const el = document.getElementById('robions-display');
	if (el) {
		const textEl = el.querySelector('.robions-text');
		if (textEl) {
			textEl.textContent = formatNumber(robions);
		}
	}
	
	updatePlayerStats();
	if (window.updateFarmDisplay) window.updateFarmDisplay();
	if (window.updateMultiplierDisplay) window.updateMultiplierDisplay();
}

function updatePlayerStats(rank = null) {
	const el = document.getElementById('player-stats');
	if (!el) return;
	
	const collectionBonusPercent = unlockedCards.size * 10;
	const multiplier = window.currentMultiplier || 1;
	
	// Bonus total = (1 + collectionBonus%) * multiplier - 1, converti en %
	// Ex: +30% collection + x1.5 mult = 1.3 * 1.5 = 1.95 = +95% total
	const totalBonusPercent = Math.round(((1 + collectionBonusPercent / 100) * multiplier - 1) * 100);
	
	const parts = [];
	
	if (totalBonusPercent > 0) {
		parts.push(`<span style="color:#22c55e">+${totalBonusPercent}%</span>`);
	}
	
	if (rank !== null) {
		parts.push(`#${rank}`);
		window.currentUserRank = rank;
	} else if (window.currentUserRank) {
		parts.push(`#${window.currentUserRank}`);
	}
	
	if (parts.length > 0) {
		el.innerHTML = parts.join(' - ');
		el.style.display = 'block';
	} else {
		el.style.display = 'none';
	}
}

window.updatePlayerStats = updatePlayerStats;

function updateGainSummary(summary) {
	const el = document.getElementById('gain-summary');
	if (!el || !summary) return;
	const { total = 0, baseSlots = 0, stakeNet = 0, specialBonus = 0, comboBonus = 0 } = summary;
	const stakeCls = stakeNet > 0 ? 'bet-delta-positive' : (stakeNet < 0 ? 'bet-delta-negative' : 'bet-delta-zero');

	// Construire la décomposition en gérant le signe dans le séparateur
	let breakdown = `${baseSlots}`;
	let hasExtra = false;
	if (stakeNet !== 0) {
		const stakeSep = stakeNet < 0 ? ' - ' : ' + ';
		const stakeVal = Math.abs(stakeNet);
		breakdown += `${stakeSep}<span class="${stakeCls}">${stakeVal}</span>`;
		hasExtra = true;
	}
	if (specialBonus > 0) {
		breakdown += ` + <span class="event-bonus">${specialBonus}</span>`;
		hasExtra = true;
	}
	if (comboBonus > 0) {
		breakdown += ` + <span class="combo-bonus">${comboBonus}</span>`;
		hasExtra = true;
	}
	// Ajouter le bonus musain s'il y a lieu
	if (window.lastMusainBonus && window.lastMusainBonus > 0) {
		breakdown += ` + <span class="musain-bonus" style="color: #FF8C00;">+${window.lastMusainBonus} 🐭</span>`;
		hasExtra = true;
		window.lastMusainBonus = 0; // réinitialiser après affichage
	}
	// Ajouter l'effet Denis (ANNULÉ) s'il y a lieu
	if (denisEffect) {
		breakdown += ` <span class="denis-malus" style="color: #FF0000; font-weight: bold;">ANNULÉ</span>`;
		hasExtra = true;
	}

	// Afficher les parenthèses uniquement s'il y a des bonus/malus en plus des slots
	if (hasExtra) {
		el.innerHTML = `Gain: ${total} (<span class="gain-breakdown">${breakdown}</span>)`;
	} else {
		el.innerHTML = `Gain: ${total}`;
	}
}

// ===== APPLICATION RÉSULTAT SPIN =====
async function applySpinResult(resultArray) {
	const collectionBonus = 1 + (unlockedCards.size * 0.10);
	const globalMultiplier = window.currentMultiplier || 1;
	
	const perRewards = resultArray.map(fn => {
		const meta = imageMetaMap[fn];
		const baseReward = meta ? rewardForRarity(meta.rarity) : 0;
		return Math.floor(baseReward * collectionBonus * globalMultiplier);
	});
	const baseGain = perRewards.reduce((a,b)=>a+b,0);
	
	const comboList = detectCombos(resultArray);
	const totalComboMultiplier = comboList.reduce((prod, c) => prod * (c.multiplier || 1), 1);
	const baseWithCombo = totalComboMultiplier > 1 ? baseGain * totalComboMultiplier : baseGain;
	
	// Système de streak combo : si événement spécial, incrémenter le streak
	const hasSpecialEvent = comboList.length > 0;
	if (hasSpecialEvent) {
		comboStreak++;
	} else {
		comboStreak = 0;
	}
	
	// Multiplicateur de streak : x5 pour 2, x10 pour 3, x20 pour 4, x40 pour 5, etc.
	let streakMultiplier = 1;
	if (comboStreak >= 2) {
		streakMultiplier = 5 * Math.pow(2, comboStreak - 2);
	}
	
	// Appliquer le multiplicateur de streak au gain avec combo
	const baseWithComboAndStreak = baseWithCombo * streakMultiplier;

	// Calcul des bonus détaillés pour affichage
	const specialBonus = Math.max(0, Math.floor(baseWithCombo - baseGain));
	const comboBonus = Math.max(0, Math.floor(baseWithComboAndStreak - baseWithCombo));
	
	// Système de malus DENIS (rareté 0)
	denisCount = resultArray.filter(fn => imageMetaMap[fn]?.rarity === 0).length;
	denisEffect = null;
	
	// Déterminer si victoire/remboursement/perte basé sur somme des raretés
	const winSum = calculateWinStatus(resultArray);
	let stakeBonusNet = 0; // Gain/perte de la MISE (indépendant du tirage)
	let stakeRefund = 0;
	let stakeLost = false;
	
	if (bet > 0) {
		if (hasSpecialEvent) {
			// RÈGLE PRIORITAIRE: Si événement spécial, toujours gagner la mise
			let stakeMultiplier = calculateStakeMultiplier(resultArray);
			if (stakeMultiplier <= NEUTRAL_THRESHOLD) {
				stakeMultiplier = 1.26;
			}
			stakeBonusNet = Math.floor(bet * stakeMultiplier);
			stakeRefund = bet;
		} else if (winSum < 1) {
			// Perte de mise (seulement si pas d'événement spécial)
			stakeBonusNet = -bet;
			stakeRefund = 0;
			stakeLost = true;
		} else if (winSum === 1) {
			// Remboursement de mise
			stakeBonusNet = 0;
			stakeRefund = bet;
		} else {
			// Gain normal de mise
			let stakeMultiplier = calculateStakeMultiplier(resultArray);
			stakeBonusNet = Math.floor(bet * stakeMultiplier);
			stakeRefund = bet;
		}
	}
	
	// MALUS DENIS : appliqué au gain du tirage SEULEMENT, pas la mise
	let tirageLoss = 0;
	if (denisCount > 0) {
		// Jouer le son scare
		if (window.denisScareSound) {
			window.denisScareSound.currentTime = 0;
			window.denisScareSound.play().catch(() => {});
		}
		if (denisCount === 1) {
			// 1 Denis = perte du gain du tirage
			denisEffect = { type: 'loss', value: baseWithComboAndStreak };
			tirageLoss = baseWithComboAndStreak;
		} else if (denisCount === 2) {
			// 2 Denis = perte de 20% des robions globaux
			const loss = Math.floor(robions * 0.2);
			denisEffect = { type: 'percent', value: 20, amount: loss };
			tirageLoss = loss;
		} else if (denisCount >= 3) {
			// 3+ Denis = perte de 40% des robions globaux
			const loss = Math.floor(robions * 0.4);
			denisEffect = { type: 'percent', value: 40, amount: loss };
			tirageLoss = loss;
		}
	}
	
	// Total = gain du tirage (avec malus Denis) + gain/perte de mise
	let totalReward = (baseWithComboAndStreak - tirageLoss) + stakeBonusNet;
	let musainBonusAmount = 0; // bonus ajouté par le musain (pour l'affichage)
	if (musainMultiplier > 1 && totalReward > 0) {
		musainBonusAmount = Math.floor(totalReward * (musainMultiplier - 1));
		totalReward = Math.floor(totalReward * musainMultiplier);
	}
	window.lastMusainBonus = musainBonusAmount; // sauvegarder pour l'affichage
	setRobions(robions + totalReward);

	// Sauvegarder la mise pour l'affichage avant réinitialisation
	const currentBet = bet;
	const wasAllIn = window.isAllInSpin || false;

	// Jouer le son approprié selon ALL IN et résultat
	// Victoire = gain net positif (stakeBonusNet > 0), pas juste totalReward > 0
	const isWin = stakeBonusNet > 0;
	const isRefund = stakeBonusNet === 0 && currentBet > 0;
	
	if (wasAllIn) {
		if (isWin && window.winAllInSound) {
			try { window.winAllInSound.currentTime = 0; window.winAllInSound.play().catch(()=>{}); } catch(e) {}
		} else if (!isWin && !isRefund && window.lossAllInSound) {
			try { window.lossAllInSound.currentTime = 0; window.lossAllInSound.play().catch(()=>{}); } catch(e) {}
		}
		// Si isRefund, aucun son
	} else if (bet > 0) {
		if (isWin && window.winNormalSound) {
			try { window.winNormalSound.currentTime = 0; window.winNormalSound.play().catch(()=>{}); } catch(e) {}
		} else if (!isWin && !isRefund && window.lossNormalSound) {
			try { window.lossNormalSound.currentTime = 0; window.lossNormalSound.play().catch(()=>{}); } catch(e) {}
		}
		// Si isRefund, aucun son
	}

	// ALL IN: réinitialiser la mise à 0 après le spin (gagnant ou perdant)
	if (window.isAllInSpin) {
		window.isAllInSpin = false;
		
		// Anti-cheat: sauvegarder immédiatement sur Firebase après un ALL-IN perdu
		if (totalReward <= 0) {
			if (window.saveGameData) {
				try {
					await saveGameData();
				} catch (e) {
					console.error('Failed to save after ALL-IN loss:', e);
				}
			}
		}
		
		bet = 0;
		// Déverrouiller les contrôles
		const betControl = document.getElementById('bet-control');
		if (betControl) betControl.classList.remove('all-in-locked');
		const allInBtn = document.getElementById('all-in-button');
		if (allInBtn) {
			allInBtn.disabled = false;
			allInBtn.style.opacity = '1';
			allInBtn.style.cursor = 'pointer';
		}
		// Retirer le néon rouge
		document.body.classList.remove('all-in-active');
		updateBetDisplay();
	}

	// Marquer cartes tirées comme débloquées et afficher "nouvelle carte" pour les premières fois
	const wrappers = document.querySelectorAll('#slot-machine .slot-wrapper');
	const newlyCompletedFamilies = [];
	let hasNewUnlocks = false;
	resultArray.forEach((fn, idx) => {
		const wasUnlocked = unlockedCards.has(fn);
		unlockedCards.add(fn);
		if (!wasUnlocked) {
			hasNewUnlocks = true;
			// Vérifier si cette carte complète une famille
			const family = imageMetaMap[fn]?.family;
			if (family) {
				const allFamilyCards = imageFilenames.filter(f => imageMetaMap[f]?.family === family);
				const unlockedInFamily = allFamilyCards.filter(f => unlockedCards.has(f));
				if (unlockedInFamily.length === allFamilyCards.length && !newlyCompletedFamilies.includes(family)) {
					newlyCompletedFamilies.push(family);
				}
			}
			const wrap = wrappers[idx];
			if (wrap) {
				const tag = document.createElement('div');
				tag.className = 'new-card-tag';
				tag.textContent = 'Nouvelle carte';
				wrap.style.position = 'relative';
				wrap.appendChild(tag);
				setTimeout(() => tag.remove(), 1600);
				// Animation additionnelle: mini vignette qui vole vers le bouton collection
				spawnUnlockShard(wrap, fn);
			}
		}
	});
	
	// Synchroniser window.userUnlockedCards immédiatement avec le Set local
	if (hasNewUnlocks) {
		window.userUnlockedCards = Array.from(unlockedCards);
		// Marquer qu'on vient de débloquer des cartes (pour éviter reload prématuré)
		window.lastUnlockTime = Date.now();
		// Sauvegarder immédiatement les débloquages (pas de debounce)
		if (window.saveGameData) {
			try {
				await window.saveGameData();
			} catch (e) {
				console.warn('Emergency save for new unlocks failed:', e);
			}
		}
	}
	
	// Jouer le son de famille complète si applicable
	if (newlyCompletedFamilies.length > 0 && window.familyCompleteSound) {
		try {
			window.familyCompleteSound.currentTime = 0;
			window.familyCompleteSound.play().catch(() => {});
		} catch (e) {}
	}
	
	// Sauvegarder dans Firebase et recharger pour garantir la synchronisation
	window.robions = robions; // Forcer la synchronisation
	requestSaveGameData();
	// Mise à jour visuelle immédiate; persistance sera faite en arrière-plan
	updateRobionsDisplay();
	updateBetDisplay();
	
	updateSlotVisuals(resultArray);
	showPerSlotGain(resultArray, perRewards);
	spawnCoinsForResults(perRewards);
	showGainEffect(totalReward);
	playResultSound();
	// Sons/animations cumulées: on passe la liste entière
	playRaritySounds(resultArray, comboList.find(c=>c.type==='triple_person') ? {type:'triple_person'} : null);
	if (comboList.length > 0) {
		triggerComboAnimation(comboList, resultArray, totalComboMultiplier);
	}
	
	// Afficher le streak si actif
	if (streakMultiplier > 1) {
		showStreakBonus(comboStreak, streakMultiplier);
	}
	
	if (stakeResult.refund > 0) {
		showBetRefundTag();
	}
	
	if (comboList.some(c => ['triple_person','triple_exact','double_exact','triple_rarity'].includes(c.type))) {
		spawnSkyCoinsForBonus(totalReward);
	}
	
	updateGainSummary({
		total: totalReward,
		baseSlots: baseGain,
		stakeNet: stakeResult.lost ? -currentBet : stakeResult.bonus,
		specialBonus,
		comboBonus
	});
}

function showStreakBonus(streak, multiplier) {
	const banner = document.createElement('div');
	banner.className = 'combo-banner streak-bonus';
	banner.style.cssText = 'position:fixed; top:30%; left:50%; transform:translate(-50%,-50%); z-index:1001; font-size:32px; font-weight:900; color:#ffea00; background:rgba(20,10,35,0.95); padding:20px 40px; border-radius:20px; border:3px solid #ffea00; box-shadow:0 0 30px rgba(255,234,0,0.6);';
	banner.textContent = `COMBO STREAK x${streak}! (x${multiplier})`;
	document.body.appendChild(banner);
	setTimeout(() => {
		banner.style.opacity = '0';
		banner.style.transition = 'opacity 0.5s';
		setTimeout(() => banner.remove(), 500);
	}, 2000);
}

function showStreakBonus(streak, multiplier) {
	const banner = document.createElement('div');
	banner.className = 'combo-banner streak-bonus';
	banner.style.cssText = 'position:fixed; top:30%; left:50%; transform:translate(-50%,-50%); z-index:1001; font-size:32px; font-weight:900; color:#ffea00; background:rgba(20,10,35,0.95); padding:20px 40px; border-radius:20px; border:3px solid #ffea00; box-shadow:0 0 30px rgba(255,234,0,0.6);';
	banner.textContent = `COMBO STREAK x${streak}! (x${multiplier})`;
	document.body.appendChild(banner);
	setTimeout(() => {
		banner.style.opacity = '0';
		banner.style.transition = 'opacity 0.5s';
		setTimeout(() => banner.remove(), 500);
	}, 2000);
}

// Rendu de la collection, groupée par rareté
// Mapping des familles avec noms lisibles
	const familyNames = {
		'bebes': '👶 Bébés',
		'caillou': '💎 Caillou',
		'humainbizarre': '🤪 Humain bizarre',
		'classe': '🎩 Classe',
		'sexy': '💋 Sexy',
		'gigachad': '💪 Gigachad',
		'oeuvres': '🎨 Œuvres',
		'dodo': '😴 Dodo',
		'alcoliques': '🍺 Alcooliques',
		'snap': '📸 Snap',
		'religieux': '✝️ Religieux',
		'bouffe': '🍴 Bouffe',
		'sportifs': '⚽ Sportifs',
		'rob': '🤖 Rob',
		'dessins': '🖼️ Dessins',
		'meme': '😂 Mème',
		'numerique': '💻 Numérique',
		'velo': '🚴 Vélo',
		'vacances': '🏖️ Vacances',
		'model3d': '🎭 Model 3D',
		'toilettes': '🚽 Toilettes',
		'cinema': '🎬 Cinéma',
		'freaky': '👻 Freaky',
		'groupes': '👥 Groupes',
		'clash': '⚔️ Clash',
		'paparazzis': '📷 Paparazzis',
		'autre': '❓ Autre'
	};function renderCollection(){
	const container = document.getElementById('collection-content');
	if (!container) return;
	
	// Utiliser DocumentFragment pour réduire les reflows
	const fragment = document.createDocumentFragment();
	
	// Afficher le bonus total en en-tête
	const bonusPercent = unlockedCards.size * 10;
	if (bonusPercent > 0) {
		const bonusHeader = document.createElement('div');
		bonusHeader.style.cssText = 'text-align:center; padding:12px; margin-bottom:16px; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); border-radius:8px; color:#22c55e; font-weight:700; font-size:16px;';
		bonusHeader.textContent = `Bonus Collection: +${bonusPercent}% (${unlockedCards.size} cartes débloquées)`;
		fragment.appendChild(bonusHeader);
	}
	
	const toggle = document.getElementById('collection-family-toggle');
	const groupByFamily = toggle ? toggle.checked : false;
	
	if (groupByFamily) {
		// Grouper par famille
		const byFamily = {};
		imageFilenames.forEach(fn => {
			const meta = imageMetaMap[fn];
			const family = meta?.family || 'autre';
			if (!byFamily[family]) byFamily[family] = [];
			byFamily[family].push(fn);
		});
		
		// Trier les familles alphabétiquement
		const familyList = Object.keys(byFamily).sort();
		familyList.forEach(family => {
			const section = document.createElement('section');
			section.className = 'family-section';
			const h = document.createElement('h3');
			
			// Vérifier si la famille est complète
			const allFamilyCards = byFamily[family];
			const unlockedInFamily = allFamilyCards.filter(fn => unlockedCards.has(fn));
			const isComplete = unlockedInFamily.length === allFamilyCards.length;
			
			h.textContent = `${familyNames[family] || family} (${byFamily[family].length})`;
			if (isComplete) {
				const completeTag = document.createElement('span');
				completeTag.style.cssText = 'color:#ffb84d; font-weight:700; margin-left:8px;';
				completeTag.textContent = '- Complète';
				h.appendChild(completeTag);
			}
			section.appendChild(h);
			const grid = document.createElement('div');
			grid.className = 'card-grid';
			
			// Batch DOM operations avec DocumentFragment + Intersection Observer
			const gridFragment = document.createDocumentFragment();
			byFamily[family].forEach(fn => {
				const item = document.createElement('div');
				const unlocked = unlockedCards.has(fn);
				const r = imageMetaMap[fn]?.rarity || 1;
				item.className = `card-item card-rarity-${r}${unlocked ? '' : ' locked'}`;
				
				// Image ou placeholder noir
				if (unlocked) {
					const imgEl = document.createElement('img');
					imgEl.className = 'card-thumb';
					imgEl.dataset.src = encodeURI(`assets/imgV2/${fn}`);
					imgEl.alt = imageMetaMap[fn]?.displayName || fn;
					imgEl.style.background = '#000';
					item.appendChild(imgEl);
				} else {
					const divEl = document.createElement('div');
					divEl.className = 'card-thumb';
					item.appendChild(divEl);
				}
				
				const name = document.createElement('div');
				name.className = 'card-name';
				name.textContent = unlocked ? (imageMetaMap[fn]?.displayName || fn.replace(/\.[^.]+$/, '')) : '???';
				item.appendChild(name);
				gridFragment.appendChild(item);
			});
			grid.appendChild(gridFragment);
			section.appendChild(grid);
			fragment.appendChild(section);
		});
	} else {
		// Grouper par rareté (comportement par défaut)
		const rarityOrder = [5,4,3,2,1];
		const rarityTitles = {1:'Commun',2:'Rare',3:'Épique',4:'Légendaire',5:'Mythique'};
		const byRarity = {1:[],2:[],3:[],4:[],5:[]};
		imageFilenames.forEach(fn => {
			const r = imageMetaMap[fn]?.rarity || 1;
			byRarity[r].push(fn);
		});
		rarityOrder.forEach(r => {
			const section = document.createElement('section');
			section.className = 'rarity-section';
			const h = document.createElement('h3');
			h.textContent = `${rarityTitles[r]} (${byRarity[r].length})`;
			section.appendChild(h);
			const grid = document.createElement('div');
			grid.className = 'card-grid';
			
			// Batch DOM operations avec DocumentFragment + Intersection Observer
			const gridFragment = document.createDocumentFragment();
			byRarity[r].forEach(fn => {
				const item = document.createElement('div');
				const unlocked = unlockedCards.has(fn);
				item.className = `card-item card-rarity-${r}${unlocked ? '' : ' locked'}`;
				
				// Image ou placeholder noir
				if (unlocked) {
					const imgEl = document.createElement('img');
					imgEl.className = 'card-thumb';
					imgEl.dataset.src = encodeURI(`assets/imgV2/${fn}`);
					imgEl.alt = imageMetaMap[fn]?.displayName || fn;
					imgEl.style.background = '#000';
					item.appendChild(imgEl);
				} else {
					const divEl = document.createElement('div');
					divEl.className = 'card-thumb';
					item.appendChild(divEl);
				}
				
				const name = document.createElement('div');
				name.className = 'card-name';
				name.textContent = unlocked ? (imageMetaMap[fn]?.displayName || fn.replace(/\.[^.]+$/, '')) : '???';
				item.appendChild(name);
				gridFragment.appendChild(item);
			});
			grid.appendChild(gridFragment);
			section.appendChild(grid);
			fragment.appendChild(section);
		});
	}
	
	// Un seul reflow: remplacer tout le contenu en une fois
	container.innerHTML = '';
	container.appendChild(fragment);
	
	// Utiliser Intersection Observer pour charger les images au fur et à mesure
	if ('IntersectionObserver' in window) {
		const imageObserver = new IntersectionObserver((entries, observer) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const img = entry.target;
					if (img.dataset.src) {
						img.src = img.dataset.src;
						delete img.dataset.src;
						observer.unobserve(img);
					}
				}
			});
		}, { rootMargin: '50px' });
		
		// Observer toutes les images non chargées
		container.querySelectorAll('img[data-src]').forEach(img => {
			imageObserver.observe(img);
		});
	} else {
		// Fallback pour les navigateurs sans IntersectionObserver
		container.querySelectorAll('img[data-src]').forEach(img => {
			img.src = img.dataset.src;
			delete img.dataset.src;
		});
	}
	
	// Gérer les clics sur les cartes pour sélectionner l'avatar
	container.querySelectorAll('.card-item').forEach((item, index) => {
		const imgEl = item.querySelector('img.card-thumb');
		if (imgEl && !item.classList.contains('locked')) {
			item.addEventListener('click', async () => {
				// Récupérer le nom du fichier depuis l'attribut data-src ou src
				const filename = imgEl.dataset.src || imgEl.src;
				const imageName = filename ? filename.split('/').pop() : null;
				
				if (imageName) {
					// Mettre à jour l'avatar sélectionné
					selectedAvatar = imageName;
					
					// Retirer la classe selected-avatar de toutes les cartes
					container.querySelectorAll('.card-item').forEach(card => {
						card.classList.remove('selected-avatar');
					});
					
					// Ajouter la classe à la carte cliquée
					item.classList.add('selected-avatar');
					
					// Sauvegarder immédiatement dans localStorage
					saveToLocalStorage();
					
					// Sauvegarder immédiatement dans Firebase
					if (window.saveGameData) {
						try {
							await window.saveGameData();
							console.log('✅ Avatar sauvegardé:', imageName);
						} catch(e) {
							console.warn('Erreur sauvegarde avatar:', e);
						}
					}
				}
			});
		}
	});
	
	// Marquer la carte de l'avatar actuel comme sélectionnée
	if (selectedAvatar) {
		container.querySelectorAll('.card-item').forEach(item => {
			const imgEl = item.querySelector('img.card-thumb');
			if (imgEl) {
				const filename = imgEl.dataset.src || imgEl.src;
				const imageName = filename ? filename.split('/').pop() : null;
				if (imageName === selectedAvatar) {
					item.classList.add('selected-avatar');
				}
			}
		});
	}
}

// ===== EFFETS VISUELS =====
// Stockage local et synchronisation Firebase
function saveToLocalStorage() {
	const gameData = {
		robions,
		unlockedCards: Array.from(unlockedCards),
		farmSpeedLevel: window.farmSpeedLevel || 0,
		farmProductionLevel: window.farmProductionLevel || 0,
		multiplierLevel: window.multiplierLevel || 0,
		robcoinBalance: window.robcoinBalance || 0,
		selectedAvatar: selectedAvatar,
		biggestAllIn: biggestAllIn,
		lastUpdated: Date.now()
	};
	try {
		localStorage.setItem('gamblingGameData', JSON.stringify(gameData));
	} catch(e) {
		console.warn('LocalStorage save error:', e);
	}
}

function loadFromLocalStorage() {
	try {
		const data = localStorage.getItem('gamblingGameData');
		if (data) {
			const parsed = JSON.parse(data);
			setRobions(parsed.robions || 0);
			unlockedCards = new Set(parsed.unlockedCards || []);
			window.farmSpeedLevel = parsed.farmSpeedLevel || 0;
			window.farmProductionLevel = parsed.farmProductionLevel || 0;
			window.multiplierLevel = parsed.multiplierLevel || 0;
			window.currentMultiplier = 1 + ((parsed.multiplierLevel || 0) * 0.01);
			window.robcoinBalance = parsed.robcoinBalance || 0;
			selectedAvatar = parsed.selectedAvatar || null;
			biggestAllIn = parsed.biggestAllIn || 0;
			updateRobionsDisplay();
			if (window.updateFarmDisplay) window.updateFarmDisplay();
			if (window.updateMultiplierDisplay) window.updateMultiplierDisplay();
			return true;
		}
	} catch(e) {
		console.warn('LocalStorage load error:', e);
	}
	return false;
}

// Sauvegarde Firebase (appelée manuellement ou auto toutes les 5 min)
async function saveGameData() {
	if (window.currentUserPseudo && window.firebaseDB && window.firebaseAuth) {
		try {
			const currentUser = window.firebaseAuth.currentUser;
			if (!currentUser) {
				console.warn('User not authenticated, cannot save');
				return;
			}
			
			// Arrondir les robions avant sauvegarde pour cohérence avec le classement
			const robionsToSave = Math.floor(robions);
			
			const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
			await setDoc(doc(window.firebaseDB, 'users', window.currentUserPseudo), {
				userId: currentUser.uid,
				pseudo: window.currentUserPseudo,
				email: currentUser.email,
				robions: robionsToSave,
				unlockedCards: Array.from(unlockedCards),
				farmSpeedLevel: window.farmSpeedLevel || 0,
				farmProductionLevel: window.farmProductionLevel || 0,
				multiplierLevel: window.multiplierLevel || 0,
				robcoinBalance: window.robcoinBalance || 0,
				selectedAvatar: selectedAvatar,
				biggestAllIn: biggestAllIn,
				lastUpdated: new Date().toISOString()
			}, { merge: true });
			// Rechargement immédiat supprimé pour réduire la pression Firestore
		} catch(e) {
			// Quota exceeded: éviter les boucles de retry agressives
			if (e && (String(e.code).includes('resource-exhausted') || String(e).toLowerCase().includes('quota'))) {
				console.warn('Firestore quota exceeded: sauvegarde différée');
			} else {
				console.warn('Firestore save error:', e);
			}
		}
	}
}

// Exposer saveGameData pour le bouton manuel
window.saveGameData = saveGameData;
window.requestSaveGameData = requestSaveGameData;

// Sauvegarde immédiate en local, Firebase débouncé (5 sec)
let __saveTimer = null;
let __autoSyncInterval = null;

function requestSaveGameData(){
	saveToLocalStorage();
	if (__saveTimer) clearTimeout(__saveTimer);
	__saveTimer = setTimeout(async () => {
		__saveTimer = null;
		if (window.saveGameData) try { await saveGameData(); } catch(e) {}
	}, 5000);
}

// Auto-sync Firebase toutes les 5 minutes
function startAutoSync() {
	if (__autoSyncInterval) clearInterval(__autoSyncInterval);
	__autoSyncInterval = setInterval(async () => {
		if (window.currentUserPseudo && window.firebaseDB) {
			try {
				await saveGameData();
				console.log('✅ Auto-sync Firebase (5 min)');
			} catch(e) {}
		}
	}, 5 * 60 * 1000);
}

// Démarrer l'auto-sync au chargement
window.addEventListener('DOMContentLoaded', () => {
	loadFromLocalStorage();
	startAutoSync();
});

// Recharger les données depuis Firebase pour synchroniser (charge local d'abord)
async function reloadGameData() {
	// Charger local d'abord
	loadFromLocalStorage();
	
	// Puis sync Firebase si connecté
	if (window.currentUserPseudo && window.firebaseDB) {
		try {
			const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
			const docSnap = await getDoc(doc(window.firebaseDB, 'users', window.currentUserPseudo));
			if (docSnap.exists()) {
				const userData = docSnap.data();
				// Mettre à jour TOUTES les variables locales avec les données Firebase
				setRobions(Math.floor(userData.robions || 0));
				unlockedCards = new Set(userData.unlockedCards || []);
				window.userRobions = robions;
				window.userUnlockedCards = userData.unlockedCards || [];
				selectedAvatar = userData.selectedAvatar || null;
				biggestAllIn = userData.biggestAllIn || 0;
				// Réinitialiser les niveaux ferme depuis Firebase
				window.farmSpeedLevel = userData.farmSpeedLevel || 0;
				window.farmProductionLevel = userData.farmProductionLevel || 0;
				if (window.updateFarmLevels) window.updateFarmLevels();
				window.userMultiplierLevel = userData.multiplierLevel || 0;
				window.multiplierLevel = userData.multiplierLevel || 0;
				window.currentMultiplier = 1 + ((userData.multiplierLevel || 0) * 0.01);
				window.userRobcoinBalance = userData.robcoinBalance || 0;
				window.robcoinBalance = userData.robcoinBalance || 0;
				// Sauver en local aussi
				saveToLocalStorage();
				// Mettre à jour l'affichage
				updateRobionsDisplay();
				if (window.updateFarmDisplay) window.updateFarmDisplay();
				if (window.updateMultiplierDisplay) window.updateMultiplierDisplay();
				console.log('✅ Données rechargées depuis Firebase:', { robions, unlockedCards: unlockedCards.size, avatar: selectedAvatar });
			}
		} catch(e) {
			console.warn('Firestore reload error:', e);
		}
	}
}

// Fonction utilitaire: forcer la synchronisation robions/cartes depuis Firebase
async function forceSyncFromFirebase() {
	if (!(window.currentUserPseudo && window.firebaseDB && typeof reloadGameData === 'function')) return;
	try {
		await reloadGameData();
		if (typeof updateBetDisplay === 'function') updateBetDisplay();
		const overlay = document.getElementById('collection-overlay');
		if (overlay && overlay.style.display === 'block' && typeof renderCollection === 'function') {
			renderCollection();
			const headerTitle = overlay.querySelector('.collection-header h2');
			if (headerTitle) {
				const size = (window.userUnlockedCards && Array.isArray(window.userUnlockedCards)) ? window.userUnlockedCards.length : (unlockedCards ? unlockedCards.size : 0);
				const bonusPercent = size * 10;
				if (bonusPercent > 0) {
					headerTitle.innerHTML = `Collection <span style="color:#22c55e;font-size:0.85em;">(Bonus collection: +${bonusPercent}%)</span>`;
				} else {
					headerTitle.textContent = 'Collection';
				}
			}
		}
		console.log('✅ Synchronisation Firebase (robions + cartes) via forceSyncFromFirebase');
	} catch(e) {
		console.warn('Erreur forceSyncFromFirebase:', e);
	}
}

window.forceSyncFromFirebase = forceSyncFromFirebase;

// Crée une mini-vignette de l'image débloquée et l'anime vers le bouton Collection
function spawnUnlockShard(slotWrap, filename){
	try {
		const btn = document.getElementById('open-collection-btn');
		if (!btn || !slotWrap || !filename) return;
		const imgSrc = encodeURI(`assets/imgV2/${filename}`);
		// Point de départ: centre du slot
		const startRect = slotWrap.getBoundingClientRect();
		const startX = startRect.left + startRect.width / 2;
		const startY = startRect.top + startRect.height / 2;
		// Cible: centre du bouton Collection
		const targetRect = btn.getBoundingClientRect();
		const targetX = targetRect.left + targetRect.width / 2;
		const targetY = targetRect.top + targetRect.height / 2;
		// Élément shard fixé au viewport
		const shard = document.createElement('img');
		shard.className = 'unlock-shard';
		shard.src = imgSrc;
		shard.alt = 'nouvelle carte';
		shard.style.left = `${startX}px`;
		shard.style.top = `${startY}px`;
		document.body.appendChild(shard);
		// Forcer le layout puis démarrer la transition vers la cible
		requestAnimationFrame(() => {
			shard.style.left = `${targetX}px`;
			shard.style.top = `${targetY}px`;
			shard.style.opacity = '0';
		});
		// Nettoyage une fois la transition terminée
		shard.addEventListener('transitionend', () => {
			shard.remove();
		}, { once: true });
	} catch(e) { /* ignore */ }
}

function showGainEffect(amount) {
	const robEl = document.getElementById('robions-display');
	if (!robEl) return;
	const span = document.createElement('span');
	span.className = 'gain-float';
	span.textContent = '+ ' + amount;
	robEl.appendChild(span);
	setTimeout(() => {
		span.classList.add('fade');
		setTimeout(() => span.remove(), 800);
	}, 50);
}

function showBetRefundTag(){
	const betControl = document.getElementById('bet-control');
	if (!betControl) return;
	const tag = document.createElement('div');
	tag.className = 'bet-refund-tag';
	tag.textContent = 'remboursé';
	betControl.appendChild(tag);
	setTimeout(() => tag.remove(), 1200);
}

function showPerSlotGain(resultArray, perRewards){
	const wrappers = document.querySelectorAll('#slot-machine .slot-wrapper');
	perRewards.forEach((val, idx) => {
		const wrap = wrappers[idx];
		if (!wrap) return;
		const filename = resultArray[idx];
		const meta = imageMetaMap[filename];
		const rarity = meta?.rarity || 1;
		wrap.style.position = 'relative';
		const span = document.createElement('span');
		span.className = 'slot-gain-float rarity-' + rarity;
		span.textContent = '+ '+val;
		wrap.appendChild(span);
		setTimeout(()=>{
			span.classList.add('fade');
			setTimeout(()=> span.remove(), 1100);
		},50);
	});
}

// Affiche une bannière cumulée et joue les sons pour chaque combo
function triggerComboAnimation(comboList, resultArray, totalMultiplier){
	const body = document.body;
	if (!body) return;
	// Choisir la classe d'animation la plus forte présente
	const types = comboList.map(c=>c.type);
	const animClass = types.includes('triple_exact') ? 'mega-combo-flash' :
					  types.includes('double_exact') ? 'big-combo-flash' :
					  'combo-flash';
	body.classList.add(animClass);

	// Jouer les sons pertinents
	comboList.forEach(c => {
		let sound = null;
		if (c.type === 'triple_exact') {
			sound = comboSounds.bigwin;
		} else if (c.type === 'triple_person') {
			const personKey = `triple_${c.person?.toLowerCase?.()}`;
			sound = comboSounds[personKey] || comboSounds.bigwin;
			if (comboSounds.win2) {
				setTimeout(() => {
					try { const win2 = comboSounds.win2; win2.currentTime = 0; win2.volume = 1.0; win2.play().catch(()=>{}); } catch(e) {}
				}, 300);
			}
		} else if (c.type === 'triple_family') {
			sound = comboSounds.sameFamily;
		} else if (c.type === 'triple_rarity') {
			if (c.rarity === 2) {
				sound = comboSounds.tripleRare;
			} else if (c.rarity === 3) {
				sound = comboSounds.tripleEpic;
			} else {
				sound = comboSounds.cash;
			}
		} else if (c.type === 'double_exact') {
			sound = comboSounds.cash;
		}
		if (sound) {
			setTimeout(() => { try { sound.currentTime = 0; sound.volume = 1.0; sound.play().catch(()=>{}); } catch(e) {} }, 260);
		}
	});

	// Bannière cumulative: lister les combos et le multiplicateur total
	const banner = document.createElement('div');
	banner.className = 'combo-banner';
	const labels = comboList.map(c => c.label);
	const text = labels.join(' + ');
	banner.textContent = `${text} ⇒ ×${totalMultiplier}`;
	body.appendChild(banner);

	const duration = types.includes('triple_exact') ? 2000 : 1400;
	setTimeout(() => { banner.classList.add('fade'); setTimeout(() => banner.remove(), 800); }, duration);
	setTimeout(() => body.classList.remove(animClass), duration + 400);
}

// ===== PLUIE DE PIÈCES =====
function computeCoinsFromAmount(amount){
	if (!amount || amount <= 0) return 0;
	return Math.min(20, Math.floor(amount));
}

function spawnCoinsForSlot(slotEl, amount){
	const count = computeCoinsFromAmount(amount);
	if (count <= 0 || !slotEl) return;
	const rect = slotEl.getBoundingClientRect();
	for (let i = 0; i < count; i++){
		const delay = Math.random() * 600;
		setTimeout(() => {
			const coin = document.createElement('span');
			coin.className = 'coin';
			const startX = rect.left + (Math.random() * rect.width);
			const startY = rect.top + 4;
			coin.style.left = startX + 'px';
			coin.style.top = startY + 'px';
			const dx = (Math.random() * 120) - 60;
			coin.style.setProperty('--dx', dx + 'px');
			const fallDur = 1.4 + Math.random() * 1.1;
			coin.style.animationDuration = `${fallDur}s, ${Math.max(1, fallDur - 0.3)}s`;
			document.body.appendChild(coin);
			coin.addEventListener('animationend', () => coin.remove(), { once: true });
		}, delay);
	}
}

function spawnCoinsForResults(perRewards){
	const wrappers = document.querySelectorAll('#slot-machine .slot-wrapper');
	wrappers.forEach((wrap, idx) => {
		spawnCoinsForSlot(wrap, perRewards[idx] || 0);
	});
}

function spawnSkyCoinsForBonus(bonusAmount){
	if (!bonusAmount || bonusAmount <= 0) return;
	const count = Math.min(150, bonusAmount);
	if (count <= 0) return;
	for (let i = 0; i < count; i++){
		const delay = Math.random() * 700;
		setTimeout(() => {
			const coin = document.createElement('span');
			coin.className = 'coin';
			const startX = Math.random() * window.innerWidth;
			const startY = -20 - Math.random() * 60;
			coin.style.left = startX + 'px';
			coin.style.top = startY + 'px';
			const dx = (Math.random() * 200) - 100;
			coin.style.setProperty('--dx', dx + 'px');
			const fallDur = 1.3 + Math.random() * 1.2;
			coin.style.animationDuration = `${fallDur}s, ${Math.max(1, fallDur - 0.3)}s`;
			document.body.appendChild(coin);
			coin.addEventListener('animationend', () => coin.remove(), { once: true });
		}, delay);
	}
}

// ===== SONS =====
function playResultSound(){
	if (resultSound) {
		try {
			resultSound.currentTime = 0;
			resultSound.play().catch(e => console.warn('Result sound play error', e));
		} catch(e) {}
	}
}

function playRaritySounds(resultArray, comboData = null){
	if (comboData && comboData.type === 'triple_person') {
		return;
	}
	let maxRarity = 1;
	resultArray.forEach(fn => {
		const meta = imageMetaMap[fn];
		if (meta && meta.rarity > maxRarity) {
			maxRarity = meta.rarity;
		}
	});
	if (maxRarity >= 2 && raritySounds[maxRarity]) {
		setTimeout(() => {
			try {
				const audio = raritySounds[maxRarity];
				audio.currentTime = 0;
				// Volume maximum déjà atteint (1.0)
				audio.play().catch(e => console.warn('Rarity sound play error', e));
			} catch(e) {
				console.warn('Rarity sound exception', e);
			}
		}, 340);
	}
}

// ===== BLOCAGE DES INTERACTIONS PAGE POUR ALL IN =====
function blockAllPageInteractions() {
	// Désactiver tous les boutons sauf le spin
	const buttons = document.querySelectorAll('button:not(#spin-button)');
	buttons.forEach(btn => {
		btn.disabled = true;
		btn.style.opacity = '0.5';
		btn.style.cursor = 'not-allowed';
	});
}

function unblockAllPageInteractions() {
	// Réactiver tous les boutons
	const buttons = document.querySelectorAll('button');
	buttons.forEach(btn => {
		btn.disabled = false;
		btn.style.opacity = '1';
		btn.style.cursor = 'pointer';
	});
}

// ===== CONTRÔLES SPIN & MISE =====
// ===== ALL IN FUNCTION =====
function allIn() {
	// Bloquer si fenêtre autoclicker warning est ouverte
	if (!window.canSpinWithoutAutoClickWarning || !window.canSpinWithoutAutoClickWarning()) return;
	
	bet = robions;
	updateBetDisplay();
	// Enregistrer le plus gros ALL IN
	if (bet > biggestAllIn) {
		biggestAllIn = bet;
		console.log(`Nouveau record ALL IN: ${biggestAllIn}`);
	}
	window.isAllInSpin = true;
	isAllInActive = true; // Marquer ALL IN actif
	// Ajouter le néon rouge
	document.body.classList.add('all-in-active');
	// Verrouiller les contrôles de mise et ALL IN
	const betControl = document.getElementById('bet-control');
	if (betControl) betControl.classList.add('all-in-locked');
	const allInBtn = document.getElementById('all-in-button');
	if (allInBtn) {
		allInBtn.disabled = true;
		allInBtn.style.opacity = '0.5';
		allInBtn.style.cursor = 'not-allowed';
	}
	const minusBtn = document.getElementById('bet-minus');
	const plusBtn = document.getElementById('bet-plus');
	if (minusBtn) minusBtn.disabled = true;
	if (plusBtn) plusBtn.disabled = true;
	// Bloquer les autres interactions: collection, leaderboard, etc.
	blockAllPageInteractions();
	// Jouer le son ALL IN sur clic
	if (allInSound) {
		try { allInSound.currentTime = 0; allInSound.play().catch(()=>{}); } catch(e) {}
	}
}

function handleSpin() {
	if (!window.SlotMachine) return;
	if (isSpinning) return;
	if (robions < bet) return;
	// Bloquer si fenêtre autoclicker warning est ouverte
	if (!window.canSpinWithoutAutoClickWarning || !window.canSpinWithoutAutoClickWarning()) return;
	// Si première spin après connexion, forcer une synchronisation préalable
	if (window.forceSyncPending && typeof forceSyncFromFirebase === 'function') {
		window.forceSyncPending = false;
		// Lancer la sync puis continuer le spin (non bloquant)
		forceSyncFromFirebase();
	}
	isSpinning = true;
	setSpinButtonEnabled(false);
	// Désactiver mise et ALL IN pendant le spin
	const minusBtn = document.getElementById('bet-minus');
	const plusBtn = document.getElementById('bet-plus');
	const allInBtn = document.getElementById('all-in-button');
	if (minusBtn) minusBtn.disabled = true;
	if (plusBtn) plusBtn.disabled = true;
	if (allInBtn) {
		allInBtn.disabled = true;
		allInBtn.style.opacity = '0.5';
		allInBtn.style.cursor = 'not-allowed';
	}
	window.SlotMachine.startSpin()
		.then(result => {
			applySpinResult(result);
		})
		.catch(err => {
			console.warn('Spin error', err);
		})
		.finally(() => {
			isSpinning = false;
			setSpinButtonEnabled(true);
			// Si ALL IN était actif, réactiver toutes les interactions
			if (isAllInActive) {
				isAllInActive = false; // Désactiver le mode ALL IN
				unblockAllPageInteractions(); // Réactiver tout
			}
			// Réactiver les contrôles de mise et ALL IN après le spin (sauf si ALL IN encore verrouillé)
			const minusBtn = document.getElementById('bet-minus');
			const plusBtn = document.getElementById('bet-plus');
			const allInBtn = document.getElementById('all-in-button');
			if (minusBtn) minusBtn.disabled = (bet === 0);
			// Recalcule du prochain palier pour savoir si + est dispo
			let nextBet;
			if (bet === 0) nextBet = 10;
			else if (bet === 10) nextBet = 20;
			else if (bet === 20) nextBet = 50;
			else if (bet === 50) nextBet = 100;
			else nextBet = bet * 2;
			if (plusBtn) plusBtn.disabled = (nextBet > robions);
			if (allInBtn && !window.isAllInSpin) {
				allInBtn.disabled = false;
				allInBtn.style.opacity = '1';
				allInBtn.style.cursor = 'pointer';
			}
			// Débloquer ALL IN après le premier spin
			if (isFirstSpinAfterConnection) {
				isFirstSpinAfterConnection = false;
				updateBetDisplay();
			}
			// Marquer le premier spin terminé (mais ne pas relancer la ferme)
			if (!window.hasDoneFirstSpin) {
				window.hasDoneFirstSpin = true;
				if (typeof window.startFarmAfterFirstSpin === 'function') {
					try { window.startFarmAfterFirstSpin(); } catch(e) {}
				}
			}
		});
}function setSpinButtonEnabled(enabled){
	const btn = document.getElementById('spin-button');
	if (btn){
		btn.disabled = !enabled;
		btn.style.opacity = enabled ? '1' : '0.6';
		btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
	}
}

function increaseBet() {
	if (bet === 0) {
		bet = 10;
	} else if (bet < 50) {
		const idx = STAKE_LEVELS.indexOf(bet);
		bet = STAKE_LEVELS[Math.min(STAKE_LEVELS.length - 1, idx + 1)];
	} else {
		bet *= 2;
	}
	updateBetDisplay();
}

function decreaseBet() {
	if (bet <= 10) {
		bet = 0;
	} else if (bet === 20) {
		bet = 10;
	} else if (bet === 50) {
		bet = 20;
	} else if (bet > 50) {
		bet /= 2;
	}
	updateBetDisplay();
}

function updateBetDisplay() {
	const valueSpan = document.getElementById('bet-value');
	if (valueSpan) {
		valueSpan.textContent = bet;
	}
	
	const tooltip = document.getElementById('bet-info-tooltip');
	if (tooltip) {
		if (bet === 0) {
			tooltip.innerHTML = `
				<strong>💰 Mise</strong><br>
				<small>Multipliez vos gains grâce aux raretés !</small><br>
				<small>Produit des 3 raretés × mise = bonus</small><br>
				<small style="color:#ff6666">Produit ≤ ${LOSS_THRESHOLD} → perte de la mise</small><br>
				<small style="color:#ffaa00">${LOSS_THRESHOLD} < Produit ≤ ${NEUTRAL_THRESHOLD} → remboursement seul</small><br>
				<small style="color:#00ff88">Produit > ${NEUTRAL_THRESHOLD} → remboursement + bonus</small>
			`;
		} else {
			tooltip.innerHTML = `
				<strong>💰 Mise : ${bet}</strong><br>
				<small><b>Raretés:</b> commun×0.8, rare×1.25, épique×2.0, légendaire×3.5, mythique×12.0</small><br>
				<small><b>Produit × mise</b> = bonus (si produit > ${NEUTRAL_THRESHOLD})</small><br>
				<small style="color:#888">Les combos s'appliquent uniquement au gain de base</small><br>
				<small style="color:#ff6666">Produit ≤ ${LOSS_THRESHOLD} → perte ${bet}</small><br>
				<small style="color:#ffaa00">${LOSS_THRESHOLD} < Produit ≤ ${NEUTRAL_THRESHOLD} → remboursement seul</small><br>
				<small style="color:#00ff88">Produit > ${NEUTRAL_THRESHOLD} → remboursement + gain</small>
			`;
		}
	}
	
	const minusBtn = document.getElementById('bet-minus');
	if (minusBtn) minusBtn.disabled = (bet === 0);
	
	let nextBet;
	if (bet === 0) nextBet = 10;
	else if (bet === 10) nextBet = 20;
	else if (bet === 20) nextBet = 50;
	else if (bet === 50) nextBet = 100;
	else nextBet = bet * 2;
	
	const plusBtn = document.getElementById('bet-plus');
	if (plusBtn) plusBtn.disabled = (nextBet > robions);
	
	// Désactiver ALL IN pour le premier spin après connexion
	const allInBtn = document.getElementById('all-in-button');
	if (allInBtn && !window.isAllInSpin) {
		if (isFirstSpinAfterConnection) {
			allInBtn.disabled = true;
			allInBtn.style.opacity = '0.5';
			allInBtn.style.cursor = 'not-allowed';
			allInBtn.title = 'ALL IN disponible après le premier tirage';
		} else {
			allInBtn.disabled = false;
			allInBtn.style.opacity = '1';
			allInBtn.style.cursor = 'pointer';
			allInBtn.title = '';
		}
	}
}

// ===== ÉVÉNEMENTS DOM =====
document.addEventListener('DOMContentLoaded', initGame);

document.addEventListener('DOMContentLoaded', () => {
	const infoIcon = document.getElementById('bet-info-icon');
	const tooltip = document.getElementById('bet-info-tooltip');
	
	if (infoIcon && tooltip) {
		infoIcon.addEventListener('click', (e) => {
			e.stopPropagation();
			const isVisible = tooltip.style.display === 'block';
			tooltip.style.display = isVisible ? 'none' : 'block';
		});
		
		document.addEventListener('click', (e) => {
			if (!tooltip.contains(e.target) && e.target !== infoIcon) {
				tooltip.style.display = 'none';
			}
		});
	}
	
	// Plus de raccourcis clavier debug (p/0/m supprimés)
	
	// Touche espace pour lancer le spin
	document.addEventListener('keydown', (e) => {
		if (e.code === 'Space' || e.key === ' ') {
			// Vérifier qu'aucun overlay n'est ouvert
			const authOverlay = document.getElementById('auth-overlay');
			const collectionOverlay = document.getElementById('collection-overlay');
			const leaderboardOverlay = document.getElementById('leaderboard-overlay');
			const isOverlayOpen = (authOverlay && authOverlay.style.display !== 'none') ||
				(collectionOverlay && collectionOverlay.classList.contains('visible')) ||
				(leaderboardOverlay && leaderboardOverlay.classList.contains('visible'));
			
			if (isOverlayOpen) return;
			
			const spinBtn = document.getElementById('spin-button');
			if (spinBtn && !spinBtn.disabled) {
				e.preventDefault();
				handleSpin();
			}
		}
	});
});

// ===== FONCTIONS PUBLIQUES =====
window.spawnMusain = spawnMusain;
window.activateMusainBoost = activateMusainBoost;

// ===== EXPORT POUR DEBUG =====
window.GameLogic = {
	handleSpin,
	updateRobionsDisplay,
	imageMetaMap: {},
	increaseBet,
	decreaseBet,
	applyStake,
	allIn
};


