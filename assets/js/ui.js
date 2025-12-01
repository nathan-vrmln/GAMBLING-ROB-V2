// ui.js
// Construction de l'interface minimaliste et liaison avec la logique de jeu.

function buildUI() {
	const robionsDiv = document.getElementById('robions-display');
	const slotRoot = document.getElementById('slot-machine');
	const button = document.getElementById('spin-button');
	const lastResult = document.getElementById('last-result');

	if (!robionsDiv) {
		console.warn('robions-display manquant');
	}
	if (slotRoot && slotRoot.querySelectorAll('.slot-wrapper').length === 0) {
		for (let i = 0; i < 3; i++) {
			const wrapper = document.createElement('div');
			wrapper.className = 'slot-wrapper';
			const col = document.createElement('div');
			col.className = 'slot-column';
			const imgTag = document.createElement('img');
			imgTag.className = 'slot-img';
			col.appendChild(imgTag);
			const info = document.createElement('div');
			info.className = 'slot-info';
			info.innerHTML = '<span class="slot-name"></span><span class="slot-rarity"></span>';
			wrapper.appendChild(col);
			wrapper.appendChild(info);
			slotRoot.appendChild(wrapper);
		}
	}
	if (!lastResult) {
		console.warn('last-result manquant');
	}
	if (button) {
		button.addEventListener('click', () => {
			if (window.GameLogic) {
				window.GameLogic.handleSpin();
			}
		});
	}
}

document.addEventListener('DOMContentLoaded', buildUI);

