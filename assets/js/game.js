// game.js
// Gestion du slot machine: système de gains, mises, combos et effets visuels/audio

// ===== VARIABLES GLOBALES =====
let robions = 0; // crédits de départ par défaut
let imageFilenames = [];
let imageMetaMap = {}; // { filename: { rarity, displayName, persons:[], adjective } }
let isSpinning = false; // état pour empêcher spam
let resultSound = null; // audio pour fin de spin
let raritySounds = {}; // sons par rareté
let comboSounds = {}; // sons pour combos
let unlockedCards = new Set(); // cartes débloquées
let allInSound = null; // son pour ALL IN
let isFirstSpinAfterConnection = true; // bloque ALL IN pour le 1er spin

// ===== CONFIGURATION SYSTÈME DE MISE =====
let bet = 0; // mise actuelle (stakes: 0,10,20,50,100,200,400...)
const STAKE_LEVELS = [0, 10, 20, 50]; // puis doublement après 50
// 3c=0.512 (perte), 2c+1r=0.8 (perte), 2r+1c=1.25 (neutre), 3r=1.953 (gain), 1é+2c=1.28 (gain)
const RARITY_STAKE_MULTIPLIERS = {
	1: 0.8,   // commun
	2: 1.25,  // rare
	3: 2.0,   // épique
	4: 3.5,   // légendaire
	5: 12.0   // mythique
};
const LOSS_THRESHOLD = 1.0;
const NEUTRAL_THRESHOLD = 1.25;

// ===== LISTE D'IMAGES PAR DÉFAUT =====
const defaultImageFilenames = [
	'abel beau 1.jpg','abel bébé 3.jpg','abel cheveux 1.jpg','abel couille 1.jpg','abel dessin 3.jpg','abel dessinrose 3.jpg','abel femme 3.jpg','abel gobelin 4.jpg','abel gris 1.jpg','abel jeune 3.jpg','abel jtm 1.jpg','abel mannequin 1.jpg','abel moche 1.jpg','abel rio 1.jpg','abel roi 1.jpg','abel snap 1.jpg','abel suspicieux 2.jpg','angelo dodo 2.jpg','angelo sdf 3.jpg','angelo soleil 1.jpg','charlie 2.jpg','charlie dessin 3.jpg','charlie sybau 4.jpg','charlie twin 3.jpg','corentin 2 - Copie (2).jpg','corentin 2.jpg','corentin bébépirate 4.jpg','corentin goofy 3.jpg','corentin judo 4.jpg','gang bites 3.jpeg','ia.jpg','mael 3D 4.jpg','mael art 2.jpg','mael bois 2.jpg','mael buzzcut 1.jpg','mael chad 2.jpg','mael chauve 1.jpg','mael classe 2.jpg','mael crétin 3.jpg','mael espacevital 4.jpg','mael goat 4.jpg','mael indien 1.jpg','mael langue 1.jpg','mael louche 1.jpg','mael moche 1.jpg','mael nu 3.jpg','mael pas content 1.jpg','mael pasbuzzcut 1.jpg','mael pdp 3.jpg','mael porfolio 4.jpg','mael rasage 2.jpg','mael retourné 3.jpg','mael robion 2.jpg','mael rouge 2.jpg','mael sigma 1.jpg','mael soirée 2.jpg','mael terreur 2.jpg','mael-mateo 2.jpg','mateo bateau 1.jpeg','mateo alcool 2.jpg','mateo beaugosse 3.jpg','mateo bk 1.jpg','mateo bois 1.jpg','mateo booking 1.jpg','mateo brosse 1.jpg','mateo caca 3.jpg','mateo concentré 2.jpg','mateo cv 1.jpg','mateo dodo 3.jpg','mateo entrepreneur 2.jpg','mateo ia.jpg','mateo japon 1.jpg','mateo marcel 1.jpg','mateo meuf 1.jpg','mateo moche 1.jpg','mateo mousse 1.jpg','mateo normal 1.jpg','mateo nucaca 4.jpg','mateo sansdent 3.jpg','mateo singe 1.jpg','mateo snap 1.jpg','mateo trentemoult 4.jpg','mateo téléphone 1.jpg','mateo voleur 1.jpg','mateo-charlie film 3.jpg','mathis 4.jpg','nathan con 1.jpg','nathan dessin 3.jpg','nathan fesse 1.jpg','nathan jesus 3.jpg','nathan mateo 3.jpg','noa 1.jpg','noa agression 3.jpg','noa aura 3.jpg','noa chevalier 2.jpg','noa cringe 1.jpg','noa dalby 3.jpg','noa goat 2.jpg','noa rapide 3.jpeg','noa rouge 1.jpeg','noa winner 3.jpg','noa-abel-mateo gang 2.jpg','noa-mateo-mael marcelcompote 4.jpg','tom molosse 4.jpg','tom vélo 4.jpeg','tomion robom 5.jpg'
];

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
function parseImageMeta(filename) {
	const noExt = filename.replace(/\.[^.]+$/, '');
	const parts = noExt.split(/\s+/).filter(Boolean);
	let rarity = null;
	const isRarityToken = (tok) => {
		const m = tok.match(/^\(?([1-5])\)?$/);
		return m ? parseInt(m[1], 10) : null;
	};
	// Cherche rareté d'abord après persons/adjective (index 2+)
	for (let i = 2; i < parts.length; i++) {
		const r = isRarityToken(parts[i]);
		if (r) { rarity = r; break; }
	}
	// Sinon scan complet
	if (!rarity) {
		for (let i = parts.length - 1; i >= 0; i--) {
			const r = isRarityToken(parts[i]);
			if (r) { rarity = r; break; }
		}
	}
	if (!rarity) rarity = 3;

	let persons = [];
	let adjective = null;
	if (parts.length > 0) {
		persons = parts[0].split('-').filter(Boolean);
	}
	if (parts.length > 1 && !/^\(?[1-5]\)?$/.test(parts[1])) {
		adjective = parts[1];
	}
	const displayName = [persons.join('-'), adjective].filter(Boolean).join(' ')
		|| noExt;
	return { rarity, displayName, persons, adjective };
}

function rarityToWeight(r) {
	switch (r) {
		case 1: return 500;
		case 2: return 300;
		case 3: return 100;
		case 4: return 10;
		case 5: return 1;
		default: return 100;
	}
}

// Récompenses par rareté: 1→1, 2→2-3, 3→2-15, 4→100, 5→500
function rewardForRarity(r) {
	switch (r) {
		case 1: return 1;
		case 2: return 2 + Math.floor(Math.random() * 2);
		case 3: return 2 + Math.floor(Math.random() * 14);
		case 4: return 100;
		case 5: return 500;
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
		win2: new Audio('assets/audio/win2.wav')
	};
	Object.values(comboSounds).forEach(s => { s.preload = 'auto'; try { s.volume = 1.0; } catch(e) {} });
	// Son ALL IN
	try {
		allInSound = new Audio('assets/audio/allin.mp3');
		allInSound.preload = 'auto';
		allInSound.volume = 1.0;
	} catch(e) { allInSound = null; }
	// Sons win/loss
	let winAllInSound = null, winNormalSound = null, lossAllInSound = null, lossNormalSound = null;
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
		lossNormalSound.volume = 1.0;
	} catch(e) {}
	window.winAllInSound = winAllInSound;
	window.winNormalSound = winNormalSound;
	window.lossAllInSound = lossAllInSound;
	window.lossNormalSound = lossNormalSound;
	const personNames = ['abel','corentin','mael','mateo','nathan','noa'];
	personNames.forEach(name => {
		const audio = new Audio(`assets/audio/triple/${name}.mp3`);
		audio.preload = 'auto';
		comboSounds[`triple_${name}`] = audio;
		try { audio.volume = 1.0; } catch(e) {}
	});
	imageFilenames = defaultImageFilenames.slice();
	try {
		const res = await fetch('assets/img/manifest.json', { cache: 'no-store' });
		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data)) {
				const filtered = data.filter(hasAllowedExt);
				if (filtered.length > 0) imageFilenames = filtered;
			}
		}
	} catch (e) {
	}

	const weights = {};
	imageMetaMap = {};
	imageFilenames.forEach(fn => {
		const meta = parseImageMeta(fn);
		imageMetaMap[fn] = meta;
		weights[fn] = rarityToWeight(meta.rarity);
	});
	if (window.SlotMachine) {
		window.SlotMachine.setImages(imageFilenames);
		if (window.SlotMachine.setImageWeights) {
			window.SlotMachine.setImageWeights(weights);
		}
	}
	
	// Charger depuis les données utilisateur et recharger depuis Firebase pour garantir la fraîcheur des données
	if (window.userRobions !== undefined) {
		robions = window.userRobions;
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
			// Recharger les données avant d'ouvrir la collection pour afficher les dernières cartes
			await reloadGameData();
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
}

// Fonction pour initialiser avec données Firebase
window.initGameWithUserData = function() {
	initGame();
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
	resultArray.forEach((filename, idx) => {
		const wrap = wrappers[idx];
		if (!wrap) return;
		const col = wrap.querySelector('.slot-column');
		if (!col) return;
		col.classList.remove('rarity-1','rarity-2','rarity-3','rarity-4','rarity-5');
		const meta = imageMetaMap[filename];
		const rarity = meta?.rarity || 3;
		col.classList.add('rarity-' + rarity);
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
				const rarityNames = {1:'commun',2:'rare',3:'épique',4:'légendaire',5:'mythique'};
				raritySpan.textContent = rarityNames[rarity] || '?';
				raritySpan.className = 'slot-rarity rarity-' + rarity;
			}
		}
	});
}

function updateRobionsDisplay() {
	const el = document.getElementById('robions-display');
	if (el) {
		el.textContent = `Robions : ${formatNumber(robions)}`;
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
	const { baseGain, stakeBet = 0, stakeBonus = 0, stakeLost = false, wasAllIn = false } = summary;
	
	if (stakeBet === 0) {
		el.innerHTML = `Gain: ${baseGain}`;
	} else {
		const stakeNet = stakeLost ? -stakeBet : stakeBonus;
		const cls = stakeNet > 0 ? 'bet-delta-positive' : (stakeNet < 0 ? 'bet-delta-negative' : 'bet-delta-zero');
		const sign = stakeNet > 0 ? '+' : '';
		el.innerHTML = `Gain: ${baseGain} (<span class="${cls}">${sign}${stakeNet}</span>)`;
	}
}

// ===== APPLICATION RÉSULTAT SPIN =====
function applySpinResult(resultArray) {
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
	
	// Si événement spécial (combo), forcer le multiplicateur de mise à minimum 1.26 pour garantir un gain
	let stakeMultiplier = calculateStakeMultiplier(resultArray);
	const hasSpecialEvent = comboList.length > 0;
	if (hasSpecialEvent && stakeMultiplier <= NEUTRAL_THRESHOLD) {
		stakeMultiplier = 1.26;
	}
	const stakeResult = applyStake(bet, stakeMultiplier);
	
	const totalReward = baseWithCombo + stakeResult.net;
	robions += totalReward;

	// Sauvegarder la mise pour l'affichage avant réinitialisation
	const currentBet = bet;
	const wasAllIn = window.isAllInSpin || false;

	// Jouer le son approprié selon ALL IN et résultat
	const isWin = totalReward > 0;
	if (wasAllIn) {
		if (isWin && window.winAllInSound) {
			try { window.winAllInSound.currentTime = 0; window.winAllInSound.play().catch(()=>{}); } catch(e) {}
		} else if (!isWin && window.lossAllInSound) {
			try { window.lossAllInSound.currentTime = 0; window.lossAllInSound.play().catch(()=>{}); } catch(e) {}
		}
	} else if (bet > 0) {
		if (isWin && window.winNormalSound) {
			try { window.winNormalSound.currentTime = 0; window.winNormalSound.play().catch(()=>{}); } catch(e) {}
		} else if (!isWin && window.lossNormalSound) {
			try { window.lossNormalSound.currentTime = 0; window.lossNormalSound.play().catch(()=>{}); } catch(e) {}
		}
	}

	// ALL IN: réinitialiser la mise à 0 après le spin (gagnant ou perdant)
	if (window.isAllInSpin) {
		window.isAllInSpin = false;
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
		updateBetDisplay();
	}

	// Marquer cartes tirées comme débloquées et afficher "nouvelle carte" pour les premières fois
	const wrappers = document.querySelectorAll('#slot-machine .slot-wrapper');
	resultArray.forEach((fn, idx) => {
		const wasUnlocked = unlockedCards.has(fn);
		unlockedCards.add(fn);
		if (!wasUnlocked) {
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
	
	// Sauvegarder dans Firebase et recharger pour garantir la synchronisation
	saveGameData().then(() => {
		// Mise à jour visuelle après synchronisation complète
		updateRobionsDisplay();
		updateBetDisplay();
	});
	
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
	
	if (stakeResult.refund > 0) {
		showBetRefundTag();
	}
	
	if (comboList.some(c => ['triple_person','triple_exact','double_exact','triple_rarity'].includes(c.type))) {
		spawnSkyCoinsForBonus(totalReward);
	}
	
	updateGainSummary({
		baseGain: baseWithCombo,
		stakeBet: currentBet,
		stakeBonus: stakeResult.bonus,
		stakeLost: stakeResult.lost,
		wasAllIn: wasAllIn
	});
}

// Rendu de la collection, groupée par rareté
function renderCollection(){
	const container = document.getElementById('collection-content');
	if (!container) return;
	container.innerHTML = '';
	
	// Afficher le bonus total en en-tête
	const bonusPercent = unlockedCards.size * 10;
	if (bonusPercent > 0) {
		const bonusHeader = document.createElement('div');
		bonusHeader.style.cssText = 'text-align:center; padding:12px; margin-bottom:16px; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); border-radius:8px; color:#22c55e; font-weight:700; font-size:16px;';
		bonusHeader.textContent = `Bonus Collection: +${bonusPercent}% (${unlockedCards.size} cartes débloquées)`;
		container.appendChild(bonusHeader);
	}
	
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
		byRarity[r].forEach(fn => {
			const item = document.createElement('div');
			const unlocked = unlockedCards.has(fn);
			item.className = `card-item card-rarity-${r}` + (unlocked ? '' : ' locked');
			// Image ou placeholder noir
			const imgEl = document.createElement(unlocked ? 'img' : 'div');
			imgEl.className = 'card-thumb';
			if (unlocked) {
				imgEl.src = encodeURI(`assets/img/${fn}`);
				imgEl.alt = imageMetaMap[fn]?.displayName || fn;
			} // sinon div noir via CSS
			const name = document.createElement('div');
			name.className = 'card-name';
			name.textContent = unlocked ? (imageMetaMap[fn]?.displayName || fn.replace(/\.[^.]+$/, '')) : '???';
			item.appendChild(imgEl);
			item.appendChild(name);
			grid.appendChild(item);
		});
		section.appendChild(grid);
		container.appendChild(section);
	});
}

// ===== EFFETS VISUELS =====
// Sauvegarde des données dans Firestore
async function saveGameData() {
	if (window.currentUserPseudo && window.firebaseDB) {
		try {
			const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
			await setDoc(doc(window.firebaseDB, 'users', window.currentUserPseudo), {
				pseudo: window.currentUserPseudo,
				robions: robions,
				unlockedCards: Array.from(unlockedCards),
				farmSpeedLevel: window.farmSpeedLevel || 0,
				farmProductionLevel: window.farmProductionLevel || 0,
				multiplierLevel: window.multiplierLevel || 0,
				robcoinBalance: window.robcoinBalance || 0,
				lastUpdated: new Date().toISOString()
			}, { merge: true });
			// Recharger immédiatement après sauvegarde pour synchroniser
			await reloadGameData();
		} catch(e) {
			console.warn('Firestore save error:', e);
		}
	}
}

// Recharger les données depuis Firestore pour garantir la synchronisation
async function reloadGameData() {
	if (window.currentUserPseudo && window.firebaseDB) {
		try {
			const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
			const docSnap = await getDoc(doc(window.firebaseDB, 'users', window.currentUserPseudo));
			if (docSnap.exists()) {
				const userData = docSnap.data();
				// Mettre à jour TOUTES les variables locales avec les données Firebase
				robions = userData.robions || 0;
				unlockedCards = new Set(userData.unlockedCards || []);
				window.userRobions = robions;
				window.userUnlockedCards = userData.unlockedCards || [];
				window.farmSpeedLevel = userData.farmSpeedLevel || 0;
				window.farmProductionLevel = userData.farmProductionLevel || 0;
				window.userMultiplierLevel = userData.multiplierLevel || 0;
				window.multiplierLevel = userData.multiplierLevel || 0;
				window.currentMultiplier = 1 + ((userData.multiplierLevel || 0) * 0.01);
				window.userRobcoinBalance = userData.robcoinBalance || 0;
				window.robcoinBalance = userData.robcoinBalance || 0;
				// Mettre à jour l'affichage
				updateRobionsDisplay();
				if (window.updateFarmDisplay) window.updateFarmDisplay();
				if (window.updateMultiplierDisplay) window.updateMultiplierDisplay();
				// Informer le module Ferme qu'un rechargement utilisateur vient d'avoir lieu
				if (typeof window.resetFarmStateOnUserReload === 'function') {
					try { window.resetFarmStateOnUserReload(); } catch(e) {}
				}
				console.log('✅ Données rechargées depuis Firebase:', { robions, unlockedCards: unlockedCards.size });
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
		const imgSrc = encodeURI(`assets/img/${filename}`);
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
		} else if (c.type === 'double_exact' || c.type === 'triple_rarity') {
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

// ===== CONTRÔLES SPIN & MISE =====
// ===== ALL IN FUNCTION =====
function allIn() {
	bet = robions;
	updateBetDisplay();
	window.isAllInSpin = true;
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
	// Jouer le son ALL IN sur clic
	if (allInSound) {
		try { allInSound.currentTime = 0; allInSound.play().catch(()=>{}); } catch(e) {}
	}
}

function handleSpin() {
	if (!window.SlotMachine) return;
	if (isSpinning) return;
	if (robions < bet) return;
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
			// Marquer le premier spin terminé et démarrer la ferme si besoin
			window.hasDoneFirstSpin = true;
			if (typeof window.startFarmAfterFirstSpin === 'function') {
				try { window.startFarmAfterFirstSpin(); } catch(e) {}
			}
		});
}

function setSpinButtonEnabled(enabled){
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
});

// ===== EXPORT POUR DEBUG =====
window.GameLogic = {
	handleSpin,
	updateRobionsDisplay,
	imageMetaMap,
	increaseBet,
	decreaseBet,
	applyStake,
	allIn
};


