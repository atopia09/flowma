// ============================================================
// Focusflow — Pomodoro Timer App
// ============================================================

// ===== Configuration =====
const SOUNDS_CONFIG = [
    { id: 'rain', name: 'Rain', emoji: '🌧️' },
    { id: 'thunder', name: 'Thunder', emoji: '⛈️' },
    { id: 'ocean', name: 'Ocean', emoji: '🌊' },
    { id: 'wind', name: 'Wind', emoji: '💨' },
    { id: 'fire', name: 'Fireplace', emoji: '🔥' },
    { id: 'night', name: 'Night', emoji: '🌙' },
];

const SCENES_CONFIG = [
    {
        id: 'midnight-breeze',
        name: 'Midnight Breeze',
        type: 'gradient',
        value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    },
    {
        id: 'lofi-sunset',
        name: 'Lofi Sunset',
        type: 'gradient',
        value: 'linear-gradient(135deg, #ff7e5f, #feb47b, #ff9a9e, #fecfef)',
    },
    {
        id: 'ethereal-mint',
        name: 'Ethereal Mint',
        type: 'gradient',
        value: 'linear-gradient(45deg, #84fab0 0%, #8fd3f4 100%, #a1c4fd 100%)',
    },
    {
        id: 'peachy-dream',
        name: 'Peachy Dream',
        type: 'gradient',
        value: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
    },
    {
        id: 'deep-ocean',
        name: 'Deep Ocean',
        type: 'gradient',
        value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
        id: 'soft-aurora',
        name: 'Soft Aurora',
        type: 'gradient',
        value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    },
    {
        id: 'minimal-dark',
        name: 'Minimal Dark',
        type: 'gradient',
        value: 'linear-gradient(135deg, #141e30, #243b55)',
    }
];

const DEFAULT_SETTINGS = {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
    autoStartBreak: true,
    autoStartFocus: false,
    autoHideNav: false,
    notificationSound: true,
    masterVolume: 60,
    uiOpacity: 100,
    uiBlur: 40,
    bgDimming: 50,
    minimalMode: false,
    activeScene: 'minimal-dark',
    soundStates: {},
};

// ============================================================
// DB Manager
// ============================================================
class DBManager {
    constructor() {
        this.dbName = 'focusflow-db';
        this.dbVersion = 1;
        this.storeName = 'files';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async saveFile(id, file) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.put(file, id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getFile(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const tx = this.db.transaction([this.storeName], 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

// ============================================================
// Sound Engine — Procedural Ambient Audio via Web Audio API
// ============================================================
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sounds = new Map();
        this.initialized = false;
        
        // URLs for local sound files
        this.urls = {
            rain: 'sounds/rain.mp3',
            thunder: 'sounds/thunder.mp3',
            ocean: 'sounds/ocean.mp3',
            wind: 'sounds/wind.mp3',
            fire: 'sounds/fire.mp3',
            night: 'sounds/night.mp3',
        };
    }

    async init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
    }

    async ensureRunning() {
        if (!this.initialized) await this.init();
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    _createSound(id) {
        if (!this.urls[id]) return null;

        const audioEl = new Audio(this.urls[id]);
        audioEl.loop = true;
        audioEl.crossOrigin = "anonymous";
        // Preload the audio file to ensure it's ready immediately
        audioEl.preload = "auto";
        
        const source = this.ctx.createMediaElementSource(audioEl);
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0; // Start silent

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        return {
            element: audioEl,
            gainNode,
            isActive: false,
            setVolume: (vol) => {
                const t = this.ctx.currentTime;
                gainNode.gain.cancelScheduledValues(t);
                gainNode.gain.setTargetAtTime(vol, t, 0.08);
            },
            start: () => {
                audioEl.play().catch(e => console.warn('Audio play failed', e));
            },
            stop: () => {
                const t = this.ctx.currentTime;
                gainNode.gain.cancelScheduledValues(t);
                gainNode.gain.setTargetAtTime(0, t, 0.3);
                setTimeout(() => {
                    audioEl.pause();
                }, 350);
            }
        };
    }

    // --- Public API ---
    async toggleSound(id, volume = 0.5) {
        await this.ensureRunning();

        if (!this.sounds.has(id)) {
            const sound = this._createSound(id);
            if (!sound) return false;
            this.sounds.set(id, sound);
        }

        const sound = this.sounds.get(id);

        if (sound.isActive) {
            sound.stop();
            sound.isActive = false;
            return false;
        } else {
            sound.start();
            sound.setVolume(volume);
            sound.isActive = true;
            return true;
        }
    }

    setSoundVolume(id, volume) {
        if (this.sounds.has(id)) {
            this.sounds.get(id).setVolume(volume);
        }
    }

    setMasterVolume(volume) {
        if (this.masterGain) {
            const t = this.ctx.currentTime;
            this.masterGain.gain.setTargetAtTime(volume, t, 0.05);
        }
    }

    isSoundActive(id) {
        return this.sounds.has(id) && this.sounds.get(id).isActive;
    }

    stopAll() {
        for (const [id, sound] of this.sounds) {
            if (sound.isActive) {
                sound.stop();
                sound.isActive = false;
            }
        }
    }

    // --- Notification chime ---
    async playChime() {
        await this.ensureRunning();
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        const now = this.ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0, now + i * 0.2);
            g.gain.linearRampToValueAtTime(0.15, now + i * 0.2 + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.8);

            osc.connect(g);
            g.connect(this.ctx.destination);
            osc.start(now + i * 0.2);
            osc.stop(now + i * 0.2 + 1);
        });
    }
}

// ============================================================
// Timer
// ============================================================
class Timer {
    constructor(onTick, onComplete) {
        this.onTick = onTick;
        this.onComplete = onComplete;
        this.duration = 25 * 60; // seconds
        this.remaining = this.duration;
        this.running = false;
        this.intervalId = null;
    }

    setDuration(minutes) {
        this.duration = minutes * 60;
        if (!this.running) {
            this.remaining = this.duration;
            this.onTick(this.remaining, this.duration);
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.intervalId = setInterval(() => this._tick(), 1000);
    }

    pause() {
        this.running = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        this.pause();
        this.remaining = this.duration;
        this.onTick(this.remaining, this.duration);
    }

    _tick() {
        if (this.remaining <= 0) {
            this.pause();
            this.onComplete();
            return;
        }
        this.remaining--;
        this.onTick(this.remaining, this.duration);
    }

    getProgress() {
        if (this.duration === 0) return 0;
        return 1 - this.remaining / this.duration;
    }
}

// ============================================================
// Background Manager
// ============================================================
class BackgroundManager {
    constructor(dbManager) {
        this.currentScene = null;
        this.bgCurrent = document.getElementById('bg-current');
        this.bgNext = document.getElementById('bg-next');
        this.customScenes = [];
        this.dbManager = dbManager;
    }

    async init() {
        this.customScenes = await this._loadCustomScenes();
    }

    setScene(scene) {
        // Crossfade
        this.bgNext.innerHTML = '';
        this.bgNext.style.backgroundImage = '';
        this.bgNext.style.background = '';
        this.bgNext.classList.remove('animated-gradient');

        if (scene.type === 'video') {
            const vid = document.createElement('video');
            vid.src = scene.blobUrl || scene.value;
            vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true;
            vid.style.width = '100%'; vid.style.height = '100%'; vid.style.objectFit = 'cover';
            this.bgNext.appendChild(vid);
        } else if (scene.type === 'image') {
            this.bgNext.style.backgroundImage = `url('${scene.value}')`;
            this.bgNext.style.backgroundSize = 'cover';
            this.bgNext.style.backgroundPosition = 'center';
        } else {
            this.bgNext.style.background = scene.value;
            this.bgNext.classList.add('animated-gradient');
        }

        // Fade in next
        this.bgNext.style.opacity = '1';

        setTimeout(() => {
            // Copy to current
            this.bgCurrent.innerHTML = '';
            this.bgCurrent.style.background = '';
            this.bgCurrent.style.backgroundImage = '';
            this.bgCurrent.classList.remove('animated-gradient');

            if (scene.type === 'video') {
                const vid = document.createElement('video');
                vid.src = scene.blobUrl || scene.value;
                vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true;
                vid.style.width = '100%'; vid.style.height = '100%'; vid.style.objectFit = 'cover';
                this.bgCurrent.appendChild(vid);
            } else if (scene.type === 'image') {
                this.bgCurrent.style.backgroundImage = `url('${scene.value}')`;
                this.bgCurrent.style.backgroundSize = 'cover';
                this.bgCurrent.style.backgroundPosition = 'center';
            } else {
                this.bgCurrent.style.background = scene.value;
                this.bgCurrent.classList.add('animated-gradient');
            }
            this.bgNext.style.opacity = '0';
            setTimeout(() => { this.bgNext.innerHTML = ''; }, 1200);
        }, 1300);

        this.currentScene = scene.id;
    }

    addCustomScene(name, value, type = 'image') {
        const id = 'custom-' + Date.now();
        const scene = { id, name, type, value, custom: true };
        this.customScenes.push(scene);
        this._saveCustomScenes();
        return scene;
    }

    async removeCustomScene(id) {
        const scene = this.customScenes.find(s => s.id === id);
        if (scene && scene.type === 'video' && scene.value.startsWith('indexeddb://')) {
            const fileId = scene.value.replace('indexeddb://', '');
            await this.dbManager.deleteFile(fileId);
        }
        this.customScenes = this.customScenes.filter(s => s.id !== id);
        this._saveCustomScenes();
    }

    getAllScenes() {
        return [...SCENES_CONFIG, ...this.customScenes];
    }

    async _loadCustomScenes() {
        try {
            const scenes = JSON.parse(localStorage.getItem('ff-custom-scenes') || '[]');
            for (const scene of scenes) {
                if (scene.type === 'video' && scene.value.startsWith('indexeddb://')) {
                    const id = scene.value.replace('indexeddb://', '');
                    const file = await this.dbManager.getFile(id);
                    if (file) {
                        scene.blobUrl = URL.createObjectURL(file);
                    }
                }
            }
            return scenes;
        } catch {
            return [];
        }
    }

    _saveCustomScenes() {
        try {
            localStorage.setItem('ff-custom-scenes', JSON.stringify(this.customScenes));
        } catch (e) {
            console.warn('Could not save custom scenes:', e);
        }
    }
}

// ============================================================
// Main App Controller
// ============================================================
class App {
    constructor() {
        this.soundEngine = new SoundEngine();
        this.dbManager = new DBManager();
        this.bgManager = new BackgroundManager(this.dbManager);
        this.settings = this._loadSettings();
        this.currentMode = 'focus'; // focus | short-break | long-break
        this.completedSessions = 0;
        this.activePanel = null;

        this.timer = new Timer(
            (remaining, duration) => this._onTimerTick(remaining, duration),
            () => this._onTimerComplete()
        );
    }

    async _init() {
        await this.dbManager.init();
        await this.bgManager.init();

        this._applySettings();
        this._bindEvents();
        this._renderSounds();
        this._renderScenes();
        this._renderSessionDots();
        this._updateTimerDisplay(this.timer.remaining, this.timer.duration);
        this._updateProgressRing(0);
        this._positionTabIndicator();

        // Apply saved scene
        const allScenes = this.bgManager.getAllScenes();
        const savedScene = allScenes.find(s => s.id === this.settings.activeScene) || allScenes[0];
        this.bgManager.setScene(savedScene);

        // Restore active sounds
        if (this.settings.soundStates) {
            for (const [id, state] of Object.entries(this.settings.soundStates)) {
                if (state.active) {
                    this.soundEngine.toggleSound(id, state.volume || 0.5);
                }
            }
        }
    }

    _loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('ff-settings'));
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    _saveSettings() {
        try {
            localStorage.setItem('ff-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }

    _applySettings() {
        this.timer.setDuration(this.settings.focusDuration);

        // Settings UI
        const setRange = (id, val) => {
            const range = document.getElementById(`range-${id}`);
            const input = document.getElementById(`input-${id}`);
            if (range) range.value = val;
            if (input) input.value = val;
        };

        setRange('focus', this.settings.focusDuration);
        setRange('short-break', this.settings.shortBreakDuration);
        setRange('long-break', this.settings.longBreakDuration);
        setRange('sessions', this.settings.sessionsBeforeLongBreak);
        setRange('ui-opacity', this.settings.uiOpacity);
        setRange('ui-blur', this.settings.uiBlur);
        setRange('bg-dimming', this.settings.bgDimming);

        this._applyUiStyles();

        const setToggle = (id, val) => {
            const el = document.getElementById(`toggle-${id}`);
            if (el) el.checked = val;
        };

        setToggle('auto-break', this.settings.autoStartBreak);
        setToggle('auto-focus', this.settings.autoStartFocus);
        setToggle('notification', this.settings.notificationSound);
        setToggle('hide-nav', this.settings.autoHideNav);
        setToggle('fullscreen', document.fullscreenElement != null);
        setToggle('minimal-mode', this.settings.minimalMode);

        document.getElementById('bottom-nav').classList.toggle('auto-hide-enabled', this.settings.autoHideNav);

        // Master volume
        const mv = document.getElementById('master-volume');
        if (mv) mv.value = this.settings.masterVolume;
        this.soundEngine.setMasterVolume(this.settings.masterVolume / 100);
    }

    _applyUiStyles() {
        const opacityRatio = this.settings.uiOpacity / 100;
        
        // Compute new opacities based on baselines
        const cardAlpha = 0.65 * opacityRatio;
        const navAlpha = 0.7 * opacityRatio;
        const panelAlpha = 0.95 * opacityRatio;

        document.documentElement.style.setProperty('--ui-opacity-card', cardAlpha);
        document.documentElement.style.setProperty('--ui-opacity-nav', navAlpha);
        document.documentElement.style.setProperty('--ui-opacity-panel', panelAlpha);

        // Compute text shadow for clarity at lower opacities
        const shadowStrength = 1 - opacityRatio;
        if (shadowStrength > 0.05) {
            document.documentElement.style.setProperty('--global-text-shadow', `0 1px ${2 + shadowStrength * 4}px rgba(0,0,0, ${shadowStrength * 0.9})`);
            document.documentElement.style.setProperty('--timer-text-shadow', `0 2px ${20 + shadowStrength * 10}px rgba(0, 0, 0, ${0.3 + shadowStrength * 0.7})`);
        } else {
            document.documentElement.style.setProperty('--global-text-shadow', 'none');
            document.documentElement.style.setProperty('--timer-text-shadow', '0 2px 20px rgba(0, 0, 0, 0.3)');
        }

        // Glass Blur
        document.documentElement.style.setProperty('--ui-blur', `${this.settings.uiBlur}px`);

        // Background Dimming
        document.documentElement.style.setProperty('--bg-dimming', this.settings.bgDimming / 100);

        // Minimal Mode
        document.body.classList.toggle('minimal-mode-active', this.settings.minimalMode);
    }

    _bindEvents() {
        // Timer click
        document.getElementById('timer-ring-wrapper').addEventListener('click', () => {
            document.getElementById('btn-start').click();
        });

        // Start / Pause
        document.getElementById('btn-start').addEventListener('click', () => {
            if (this.timer.running) {
                this.timer.pause();
                this._setPlayIcon(true);
            } else {
                this.timer.start();
                this._setPlayIcon(false);
            }
        });

        // Reset
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.timer.reset();
            this._setPlayIcon(true);
            this._updateProgressRing(0);
        });

        // Skip
        document.getElementById('btn-skip').addEventListener('click', () => {
            this._onTimerComplete();
        });

        // Mode tabs
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this._switchMode(mode);
            });
        });

        // Bottom nav
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                if (panel === 'timer') {
                    this._closePanel();
                } else {
                    this._openPanel(panel);
                }

                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Panel backdrop
        document.getElementById('panel-backdrop').addEventListener('click', () => {
            this._closePanel();
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('nav-timer').classList.add('active');
        });

        // Settings ranges
        const rangeBindings = [
            { id: 'focus', key: 'focusDuration' },
            { id: 'short-break', key: 'shortBreakDuration' },
            { id: 'long-break', key: 'longBreakDuration' },
            { id: 'sessions', key: 'sessionsBeforeLongBreak' },
            { id: 'ui-opacity', key: 'uiOpacity' },
            { id: 'ui-blur', key: 'uiBlur' },
            { id: 'bg-dimming', key: 'bgDimming' },
        ];

        rangeBindings.forEach(({ id, key }) => {
            const range = document.getElementById(`range-${id}`);
            const input = document.getElementById(`input-${id}`);
            if (!range || !input) return;

            const updateSetting = (val) => {
                this.settings[key] = val;
                this._saveSettings();

                if (['uiOpacity', 'uiBlur', 'bgDimming'].includes(key)) {
                    this._applyUiStyles();
                }

                // Update timer if matching current mode
                if (id === 'focus' && this.currentMode === 'focus' && !this.timer.running) {
                    this.timer.setDuration(val);
                } else if (id === 'short-break' && this.currentMode === 'short-break' && !this.timer.running) {
                    this.timer.setDuration(val);
                } else if (id === 'long-break' && this.currentMode === 'long-break' && !this.timer.running) {
                    this.timer.setDuration(val);
                }

                if (id === 'sessions') {
                    this._renderSessionDots();
                }
            };

            range.addEventListener('input', () => {
                const val = parseInt(range.value);
                input.value = val;
                updateSetting(val);
            });

            input.addEventListener('change', () => {
                let val = parseInt(input.value);
                if (isNaN(val) || val < parseInt(input.min)) val = parseInt(input.min);
                if (val > parseInt(input.max)) val = parseInt(input.max);
                input.value = val;
                range.value = val;
                updateSetting(val);
            });
        });

        // Toggles
        const toggleBindings = [
            { id: 'auto-break', key: 'autoStartBreak' },
            { id: 'auto-focus', key: 'autoStartFocus' },
            { id: 'notification', key: 'notificationSound' },
            { id: 'hide-nav', key: 'autoHideNav' },
            { id: 'minimal-mode', key: 'minimalMode' },
        ];

        toggleBindings.forEach(({ id, key }) => {
            const el = document.getElementById(`toggle-${id}`);
            if (!el) return;
            el.addEventListener('change', () => {
                this.settings[key] = el.checked;
                this._saveSettings();

                if (key === 'autoHideNav') {
                    document.getElementById('bottom-nav').classList.toggle('auto-hide-enabled', el.checked);
                } else if (key === 'minimalMode') {
                    this._applyUiStyles();
                }
            });
        });

        // Fullscreen Toggle
        const fsToggle = document.getElementById('toggle-fullscreen');
        if (fsToggle) {
            fsToggle.addEventListener('change', () => {
                if (fsToggle.checked) {
                    document.documentElement.requestFullscreen().catch(e => {
                        console.warn('Fullscreen failed:', e);
                        fsToggle.checked = false;
                    });
                } else {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    }
                }
            });

            document.addEventListener('fullscreenchange', () => {
                fsToggle.checked = (document.fullscreenElement != null);
            });
        }

        // Master volume
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.settings.masterVolume = val;
            this.soundEngine.setMasterVolume(val / 100);
            this._saveSettings();
        });

        // Upload background
        document.getElementById('btn-upload-bg').addEventListener('click', () => {
            document.getElementById('bg-file-input').click();
        });

        document.getElementById('bg-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const isVideo = file.type.startsWith('video/');
            const name = file.name.replace(/\.[^.]+$/, '');

            if (isVideo) {
                const fileId = 'video-' + Date.now();
                await this.dbManager.saveFile(fileId, file);

                const dbUrl = 'indexeddb://' + fileId;
                const scene = this.bgManager.addCustomScene(name, dbUrl, 'video');
                scene.blobUrl = URL.createObjectURL(file);

                this.bgManager.setScene(scene);
                this.settings.activeScene = scene.id;
                this._saveSettings();
                this._renderScenes();
                e.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                const scene = this.bgManager.addCustomScene(name, dataUrl, 'image');
                this.bgManager.setScene(scene);
                this.settings.activeScene = scene.id;
                this._saveSettings();
                this._renderScenes();
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        // Tab indicator resize on window resize
        window.addEventListener('resize', () => this._positionTabIndicator());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this._isInputFocused()) {
                e.preventDefault();
                document.getElementById('btn-start').click();
            }
            if (e.code === 'Escape' && this.activePanel) {
                this._closePanel();
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.getElementById('nav-timer').classList.add('active');
            }
        });
    }

    _isInputFocused() {
        const el = document.activeElement;
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }

    // --- Timer callbacks ---
    _onTimerTick(remaining, duration) {
        this._updateTimerDisplay(remaining, duration);
        this._updateProgressRing(this.timer.getProgress());

        // Update page title
        const m = String(Math.floor(remaining / 60)).padStart(2, '0');
        const s = String(remaining % 60).padStart(2, '0');
        const emoji = this.currentMode === 'focus' ? '🍅' : '☕';
        document.title = `${emoji} ${m}:${s} — Focusflow`;
    }

    _onTimerComplete() {
        this.timer.pause();
        this._setPlayIcon(true);

        // Flash effect
        const flash = document.createElement('div');
        flash.className = 'timer-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 1600);

        // Play notification
        if (this.settings.notificationSound) {
            this.soundEngine.playChime();
        }

        // Determine next mode
        if (this.currentMode === 'focus') {
            this.completedSessions++;
            this._renderSessionDots();

            if (this.completedSessions >= this.settings.sessionsBeforeLongBreak) {
                this.completedSessions = 0;
                this._switchMode('long-break');
                if (this.settings.autoStartBreak) {
                    setTimeout(() => this.timer.start(), 500);
                    this._setPlayIcon(false);
                }
            } else {
                this._switchMode('short-break');
                if (this.settings.autoStartBreak) {
                    setTimeout(() => this.timer.start(), 500);
                    this._setPlayIcon(false);
                }
            }
        } else {
            // Break completed, switch back to focus
            this._switchMode('focus');
            if (this.settings.autoStartFocus) {
                setTimeout(() => this.timer.start(), 500);
                this._setPlayIcon(false);
            }
        }
    }

    _switchMode(mode) {
        this.currentMode = mode;
        this.timer.pause();
        this._setPlayIcon(true);

        // Set duration
        const durations = {
            'focus': this.settings.focusDuration,
            'short-break': this.settings.shortBreakDuration,
            'long-break': this.settings.longBreakDuration,
        };
        this.timer.setDuration(durations[mode]);
        this._updateProgressRing(0);

        // Update mode tab active state
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
        if (activeTab) activeTab.classList.add('active');
        this._positionTabIndicator();

        // Update label
        const labels = {
            'focus': 'focus time',
            'short-break': 'short break',
            'long-break': 'long break',
        };
        document.getElementById('timer-label').textContent = labels[mode];

        // Update accent color for mode
        const colors = {
            'focus': { accent: '#E8A87C', secondary: '#D4735E' },
            'short-break': { accent: '#7CC8E8', secondary: '#5EA4D4' },
            'long-break': { accent: '#7CE8A8', secondary: '#5ED47E' },
        };
        const c = colors[mode];
        document.documentElement.style.setProperty('--accent', c.accent);
        document.documentElement.style.setProperty('--accent-secondary', c.secondary);
        document.documentElement.style.setProperty('--accent-glow', c.accent.replace(')', ', 0.25)').replace('rgb', 'rgba').replace('#', ''));

        // Compute glow color from hex
        const hex = c.accent;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);
        document.documentElement.style.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, 0.1)`);
    }

    // --- UI Updates ---
    _updateTimerDisplay(remaining, duration) {
        const m = String(Math.floor(remaining / 60)).padStart(2, '0');
        const s = String(remaining % 60).padStart(2, '0');
        document.getElementById('timer-time').textContent = `${m}:${s}`;
    }

    _updateProgressRing(progress) {
        const circumference = 2 * Math.PI * 136;
        const offset = circumference * (1 - progress);
        document.getElementById('ring-progress').style.strokeDashoffset = offset;
        document.getElementById('ring-progress').style.strokeDasharray = circumference;
    }

    _setPlayIcon(showPlay) {
        document.getElementById('icon-play').classList.toggle('hidden', !showPlay);
        document.getElementById('icon-pause').classList.toggle('hidden', showPlay);
    }

    _positionTabIndicator() {
        const tabs = document.getElementById('mode-tabs');
        const activeTab = tabs.querySelector('.mode-tab.active');
        const indicator = document.getElementById('tab-indicator');
        if (!activeTab || !indicator) return;

        const tabRect = activeTab.getBoundingClientRect();
        const containerRect = tabs.getBoundingClientRect();

        indicator.style.width = tabRect.width + 'px';
        indicator.style.left = (tabRect.left - containerRect.left) + 'px';
    }

    _renderSessionDots() {
        const container = document.getElementById('session-indicator');
        container.innerHTML = '';
        const total = this.settings.sessionsBeforeLongBreak;

        for (let i = 0; i < total; i++) {
            const dot = document.createElement('div');
            dot.className = 'session-dot';
            if (i < this.completedSessions) {
                dot.classList.add('completed');
            } else if (i === this.completedSessions && this.currentMode === 'focus') {
                dot.classList.add('active');
            }
            container.appendChild(dot);
        }
    }

    // --- Sounds ---
    _renderSounds() {
        const grid = document.getElementById('sounds-grid');
        grid.innerHTML = '';

        SOUNDS_CONFIG.forEach(sound => {
            const savedState = this.settings.soundStates[sound.id] || { active: false, volume: 50 };
            const card = document.createElement('div');
            card.className = 'sound-card' + (savedState.active ? ' active' : '');
            card.dataset.soundId = sound.id;

            card.innerHTML = `
                <div class="sound-icon">${sound.emoji}</div>
                <div class="sound-name">${sound.name}</div>
                <div class="sound-volume">
                    <input type="range" min="0" max="100" value="${savedState.volume || 50}" 
                           data-sound-vol="${sound.id}" aria-label="${sound.name} volume">
                </div>
            `;

            // Click to toggle
            card.addEventListener('click', async (e) => {
                if (e.target.type === 'range') return; // don't toggle on slider
                const vol = parseInt(card.querySelector('input[type="range"]').value) / 100;
                const isActive = await this.soundEngine.toggleSound(sound.id, vol);
                card.classList.toggle('active', isActive);

                // Save state
                if (!this.settings.soundStates[sound.id]) {
                    this.settings.soundStates[sound.id] = {};
                }
                this.settings.soundStates[sound.id].active = isActive;
                this._saveSettings();
            });

            // Volume slider
            const slider = card.querySelector('input[type="range"]');
            slider.addEventListener('input', (e) => {
                e.stopPropagation();
                const vol = parseInt(e.target.value) / 100;
                this.soundEngine.setSoundVolume(sound.id, vol);

                if (!this.settings.soundStates[sound.id]) {
                    this.settings.soundStates[sound.id] = {};
                }
                this.settings.soundStates[sound.id].volume = parseInt(e.target.value);
                this._saveSettings();
            });

            slider.addEventListener('click', (e) => e.stopPropagation());

            grid.appendChild(card);
        });
    }

    // --- Scenes ---
    _renderScenes() {
        const grid = document.getElementById('scenes-grid');
        grid.innerHTML = '';

        const allScenes = this.bgManager.getAllScenes();

        allScenes.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'scene-card' + (this.settings.activeScene === scene.id ? ' active' : '');

            const thumb = document.createElement('div');
            thumb.className = 'scene-thumb';
            if (scene.type === 'image') {
                thumb.style.backgroundImage = `url('${scene.value}')`;
            } else if (scene.type === 'video') {
                const vid = document.createElement('video');
                vid.src = scene.value;
                vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
                vid.style.width = '100%'; vid.style.height = '100%'; vid.style.objectFit = 'cover';
                thumb.appendChild(vid);
            } else {
                thumb.style.background = scene.value;
            }

            const label = document.createElement('div');
            label.className = 'scene-label';
            label.textContent = scene.name;

            card.appendChild(thumb);
            card.appendChild(label);

            // Remove button for custom scenes
            if (scene.custom) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'scene-remove';
                removeBtn.innerHTML = '×';
                removeBtn.title = 'Remove';
                removeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.bgManager.removeCustomScene(scene.id);
                    if (this.settings.activeScene === scene.id) {
                        this.settings.activeScene = 'minimal-dark';
                        this.bgManager.setScene(SCENES_CONFIG[0]);
                    }
                    this._saveSettings();
                    this._renderScenes();
                });
                card.appendChild(removeBtn);
            }

            card.addEventListener('click', () => {
                this.bgManager.setScene(scene);
                this.settings.activeScene = scene.id;
                this._saveSettings();

                // Update active state
                grid.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            });

            grid.appendChild(card);
        });
    }

    // --- Panel ---
    _openPanel(name) {
        const container = document.getElementById('panel-container');
        const backdrop = document.getElementById('panel-backdrop');

        // Hide all panels
        container.querySelectorAll('.panel-page').forEach(p => p.classList.add('hidden'));

        // Show target panel
        const target = document.getElementById(`panel-${name}`);
        if (target) target.classList.remove('hidden');

        container.classList.add('open');
        backdrop.classList.add('active');
        this.activePanel = name;
    }

    _closePanel() {
        const container = document.getElementById('panel-container');
        const backdrop = document.getElementById('panel-backdrop');

        container.classList.remove('open');
        backdrop.classList.remove('active');
        this.activePanel = null;
    }
}

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    window.app = new App();
    await window.app._init();
});
