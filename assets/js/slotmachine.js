// slotmachine.js
// Gestion de la machine à sous à 3 colonnes. Fournit startSpin() retournant une Promise
// qui se résout avec le résultat final: ["imageA.png", "imageC.png", "imageA.png"]

 (function () {
	const COLUMN_COUNT = 3;
	const SPIN_MIN_DURATION = 1200; // durée minimale avant ralentissement
	const STOP_DELAY_BETWEEN = 350; // délai entre arrêts successifs
	const INITIAL_INTERVAL = 40; // vitesse initiale (ms entre changements)
	const SLOW_INTERVAL = 120; // vitesse quand ralentit
	const containerId = 'slot-machine';
	const IMAGE_BASE_PATH = 'assets/img/'; // chemin adapté (plus de sous-dossier slots/)

	let images = []; // liste des noms de fichiers (ex: 'imageA.png')
	let preloaded = {}; // cache Image objects
	let weights = null; // { filename: weight }

	function setImages(list) {
		images = Array.isArray(list) ? list.slice() : [];
		preloadImages();
	}

	function setImageWeights(map) {
		weights = map || null;
	}

	function preloadImages() {
		images.forEach(name => {
			if (!preloaded[name]) {
				const img = new Image();
				img.src = encodeURI(IMAGE_BASE_PATH + name);
				preloaded[name] = img;
			}
		});
	}

	function getColumns() {
		const root = document.getElementById(containerId);
		if (!root) return [];
		return Array.from(root.querySelectorAll('.slot-column'));
	}

	function pickRandom() {
		if (images.length === 0) return null;
		if (!weights) {
			const idx = Math.floor(Math.random() * images.length);
			return images[idx];
		}
		let total = 0;
		for (const name of images) {
			const w = Math.max(0, weights[name] || 0);
			total += w;
		}
		if (total <= 0) {
			const idx = Math.floor(Math.random() * images.length);
			return images[idx];
		}
		let r = Math.random() * total;
		for (const name of images) {
			const w = Math.max(0, weights[name] || 0);
			if (r < w) return name;
			r -= w;
		}
		return images[images.length - 1];
	}

	function applyImageToColumn(col, filename) {
		if (!filename) return;
		let imgTag = col.querySelector('img.slot-img');
		if (!imgTag) {
			imgTag = document.createElement('img');
			imgTag.className = 'slot-img';
			// Insère l'image avant tout autre contenu (labels, etc.) sans effacer.
			if (col.firstChild) col.insertBefore(imgTag, col.firstChild); else col.appendChild(imgTag);
		}
		imgTag.src = encodeURI(IMAGE_BASE_PATH + filename);
		imgTag.alt = filename;
	}

	// Anime une colonne jusqu'à l'arrêt et retourne la valeur finale
	function spinSingleColumn(col, totalDuration, finalIndex) {
		return new Promise(resolve => {
			const start = performance.now();
			let interval = INITIAL_INTERVAL;
			let lastChange = 0;
			let stopped = false;
			let finalImage = null;

			function step(now) {
				if (now - lastChange >= interval) {
					lastChange = now;
					const img = pickRandom();
					applyImageToColumn(col, img);
				}
				const elapsed = now - start;
				if (!stopped && elapsed >= totalDuration) {
					// ralentissement
					interval = SLOW_INTERVAL;
					stopped = true;
				}
				if (stopped && elapsed >= totalDuration + 600) {
					// choisir image finale
					finalImage = pickRandom();
					applyImageToColumn(col, finalImage);
					col.classList.add('stopped');
					playStopSound(finalIndex, finalImage);
					// Effets visuels supplémentaires selon rareté (particules)
					try {
						let rarity = 1;
						if (window.GameLogic && window.GameLogic.imageMetaMap) {
							const meta = window.GameLogic.imageMetaMap[finalImage];
							if (meta && meta.rarity) rarity = meta.rarity;
						}
						if (rarity >= 4) {
							spawnParticles(col, rarity === 5 ? 26 : 12, rarity === 5);
						}
					} catch(e) {}
					resolve(finalImage);
					return;
				}
				requestAnimationFrame(step);
			}
			requestAnimationFrame(step);
		});
	}

	function spawnParticles(col, count, rainbow){
		const holder = document.createElement('div');
		holder.className = 'particles-holder';
		col.appendChild(holder);
		for (let i=0;i<count;i++) {
			const p = document.createElement('div');
			p.className = 'particle';
			const angle = Math.random() * Math.PI * 2;
			const dist = 20 + Math.random() * 60;
			const x = Math.cos(angle) * dist;
			const y = Math.sin(angle) * dist;
			p.style.setProperty('--tx', x+'px');
			p.style.setProperty('--ty', y+'px');
			if (rainbow) {
				const hue = Math.floor(Math.random()*360);
				p.style.background = `hsl(${hue} 90% 55%)`;
			} else {
				p.style.background = 'rgba(180,0,255,0.85)';
			}
			holder.appendChild(p);
		}
		setTimeout(()=> holder.remove(), 1400);
	}

	// Lance le spin des 3 colonnes
	function startSpin() {
		const columns = getColumns();
		if (columns.length !== COLUMN_COUNT) {
			console.warn('Slot machine: nombre de colonnes incorrect.');
		}
		if (images.length === 0) {
			console.warn('Slot machine: aucune image chargée.');
		}
		// nettoyage classes (enlève état arrêté et néons)
		columns.forEach(col => {
			col.classList.remove('stopped','rarity-1','rarity-2','rarity-3','rarity-4','rarity-5');
		});

		const promises = columns.map((col, i) => {
			const extraDelay = i * STOP_DELAY_BETWEEN;
			return spinSingleColumn(col, SPIN_MIN_DURATION + extraDelay, i);
		});
		return Promise.all(promises);
	}

	// Expose API globale
	window.SlotMachine = {
		setImages,
		setImageWeights,
		startSpin,
		playComboSound
	};

	// ---- Audio pour notes de piano ----
	let audioCtx = null;
	function ensureAudioCtx(){
		if (!audioCtx) {
			audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		}
	}
	function playStopSound(index, filename){
		try {
			ensureAudioCtx();
			const ctx = audioCtx;
			// Déterminer la rareté
			let rarity = 1;
			if (window.GameLogic?.imageMetaMap?.[filename]?.rarity) {
				rarity = window.GameLogic.imageMetaMap[filename].rarity;
			}
			// Fréquence unique par rareté (notes croissantes)
			const freqByRarity = {
				1: 349.23,   // F4 (commun - grave)
				2: 440.00,   // A4 (rare)
				3: 523.25,   // C5 (épique)
				4: 659.25,   // E5 (légendaire)
				5: 987.77    // B5 (mythique - aigu)
			};
			const mainFreq = freqByRarity[rarity] || 440;
			const waveByRarity = {1:'sine',2:'triangle',3:'sawtooth',4:'square',5:'square'};
			const mainWave = waveByRarity[rarity] || 'sine';
			const duration = rarity>=5 ? 1.1 : rarity===4 ? 0.9 : rarity===3 ? 0.75 : rarity===2 ? 0.6 : 0.45;
			// Oscillateur principal
			const osc = ctx.createOscillator();
			osc.type = mainWave;
			osc.frequency.value = mainFreq;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, ctx.currentTime);
			g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.04);
			g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
			osc.connect(g).connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + duration + 0.02);
			// Couche supplémentaire pour rareté >=3
			if (rarity >= 3) {
				const osc2 = ctx.createOscillator();
				osc2.type = rarity>=5 ? 'sawtooth' : 'sine';
				osc2.frequency.value = mainFreq * (rarity>=5 ? 1.5 : 1.25);
				const g2 = ctx.createGain();
				g2.gain.setValueAtTime(0.0001, ctx.currentTime);
				g2.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.05);
				g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
				osc2.connect(g2).connect(ctx.destination);
				osc2.start();
				osc2.stop(ctx.currentTime + duration + 0.02);
			}
			// Effet "spark" mythique
			if (rarity === 5) {
				for (let i=0;i<6;i++) {
					const sp = ctx.createOscillator();
					sp.type = 'sine';
					sp.frequency.value = mainFreq * (1 + i*0.12);
					const sg = ctx.createGain();
					sg.gain.setValueAtTime(0.0001, ctx.currentTime + 0.1 + i*0.03);
					sg.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.12 + i*0.03);
					sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35 + i*0.03);
					sp.connect(sg).connect(ctx.destination);
					sp.start(ctx.currentTime + 0.1 + i*0.03);
					sp.stop(ctx.currentTime + 0.37 + i*0.03);
				}
			}
		} catch(e) {
			console.warn('Audio stop sound error', e);
		}
	}

	// Son combiné pour triple même prénom
	function playComboSound(resultArray, person){
		try {
			ensureAudioCtx();
			const ctx = audioCtx;
			const baseTime = ctx.currentTime;
			// Fréquences par rareté (palette simple)
			const freqByRarity = {1:440,2:523.25,3:587.33,4:659.25,5:783.99};
			resultArray.forEach((fn, idx) => {
				let rarity = 1;
				if (window.GameLogic && window.GameLogic.imageMetaMap) {
					const meta = window.GameLogic.imageMetaMap[fn];
					if (meta && meta.rarity) rarity = meta.rarity;
				}
				const freq = freqByRarity[rarity] || 440;
				const osc = ctx.createOscillator();
				osc.type = rarity >=4 ? 'sawtooth' : (rarity===3 ? 'triangle' : 'sine');
				osc.frequency.value = freq;
				const g = ctx.createGain();
				g.gain.setValueAtTime(0.0001, baseTime + idx*0.08);
				g.gain.exponentialRampToValueAtTime(0.5, baseTime + idx*0.08 + 0.04);
				g.gain.exponentialRampToValueAtTime(0.001, baseTime + 1.2);
				osc.connect(g).connect(ctx.destination);
				osc.start(baseTime + idx*0.08);
				osc.stop(baseTime + 1.22);
			});
			// Burst supplémentaire si mythique présent
			const hasMythic = resultArray.some(fn => {
				const meta = window.GameLogic?.imageMetaMap?.[fn];
				return meta?.rarity === 5;
			});
			if (hasMythic) {
				for (let i=0;i<8;i++) {
					const osc = ctx.createOscillator();
					osc.type = 'square';
					osc.frequency.value = 900 + i*40;
					const g = ctx.createGain();
					g.gain.setValueAtTime(0.0001, baseTime + 0.2 + i*0.03);
					g.gain.exponentialRampToValueAtTime(0.3, baseTime + 0.23 + i*0.03);
					g.gain.exponentialRampToValueAtTime(0.001, baseTime + 0.5 + i*0.03);
					osc.connect(g).connect(ctx.destination);
					osc.start(baseTime + 0.2 + i*0.03);
					osc.stop(baseTime + 0.55 + i*0.03);
				}
			}
		} catch(e) { console.warn('Combo sound error', e); }
	}
})();

