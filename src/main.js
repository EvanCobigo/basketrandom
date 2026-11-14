// Entry point: wires renderer, input, audio and UI into the Game.

import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(window);
input.bindTouch(canvas);
const audio = new Audio();
const ui = new UI(document.getElementById('ui'));
ui.setMuted(audio.muted);

const game = new Game({ renderer, input, audio, ui });

ui.on('start-2p', () => game.startMatch('2p'));
ui.on('start-cpu', () => game.startMatch('cpu'));
ui.on('howto', () => ui.toggleHowTo());
ui.on('resume', () => game.togglePause());
ui.on('pause', () => game.togglePause());
ui.on('restart', () => game.startMatch(game.mode));
ui.on('rematch', () => game.startMatch(game.mode));
ui.on('menu', () => game.toMenu());
ui.on('mute', () => { audio.unlock(); ui.setMuted(audio.toggleMute()); });

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// Exposed for automated tests / debugging.
window.__game = game;
