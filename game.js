// SPACETIME 3D - BATTLEFRONT-STYLE FLYING

class SpaceGame3D {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.particles = [];

        this.gameState = 'start';
        this.score = 0;
        this.health = 100;
        this.invincible = 120;

        this.mouse = { x: 0, y: 0 };
        this.keys = {};

        this.clock = new THREE.Clock();

        // Ship physics
        this.ship = null;
        this.velocity = new THREE.Vector3();
        this.speed = 2;
        this.maxSpeed = 8;
        this.minSpeed = 0.5;
        this.acceleration = 0.05;
        this.shipRotation = { x: 0, y: 0, z: 0 };

        // Camera mode
        this.thirdPerson = true;

        // Ships system
        this.currentShip = 'starter';
        this.ships = this.loadShips();
        this.purchasedShips = this.loadPurchasedShips();

        // Bullet damage
        this.bulletDamage = 1;
        this.fireRate = 1;
        this.shootTimer = 0;

        // Engine trails
        this.engineTrails = [];
        this.trailTimer = 0;

        // Manual roll from Q/E (stays until you roll back)
        this.manualRoll = 0;

        // Minimap setup
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
        if (this.minimapCanvas) {
            this.minimapCanvas.width = 180;
            this.minimapCanvas.height = 180;
        }

        // MULTIPLAYER
        this.serverUrl = 'https://spacetime-3d.onrender.com';
        this.socket = null;
        this.playerId = null;
        this.lobbyCode = null;
        this.isHost = false;
        this.otherPlayers = new Map(); // Other players' ships
        this.multiplayer = false; // Single player by default
        this.playerName = 'Pilot' + Math.floor(Math.random() * 9999);

        try {
            this.init();
            this.setupEventListeners();
            console.log("Game initialized successfully!");
        } catch (error) {
            console.error("Error initializing game:", error);
            alert("Error starting game: " + error.message);
        }
    }

    loadShips() {
        return {
            starter: {
                name: 'Starter Ship',
                description: 'Balanced stats for beginners',
                cost: 0,
                health: 100,
                maxSpeed: 3,
                minSpeed: 0.5,
                acceleration: 0.04,
                bulletDamage: 1,
                fireRate: 1,
                color: 0xcccccc
            },
            speed: {
                name: 'Speed Demon',
                description: 'Blazing fast but fragile',
                cost: 2500,
                health: 60,
                maxSpeed: 18,
                minSpeed: 2,
                acceleration: 0.12,
                bulletDamage: 1,
                fireRate: 1,
                color: 0x00ff88
            },
            tank: {
                name: 'Heavy Tank',
                description: 'Slow but extremely tough',
                cost: 4000,
                health: 200,
                maxSpeed: 5,
                minSpeed: 0.3,
                acceleration: 0.03,
                bulletDamage: 1,
                fireRate: 1,
                color: 0x4444ff
            },
            sniper: {
                name: 'Sniper',
                description: 'Long-range powerful lasers',
                cost: 6000,
                health: 80,
                maxSpeed: 7,
                minSpeed: 0.5,
                acceleration: 0.05,
                bulletDamage: 3,
                fireRate: 0.7,
                color: 0xff00ff
            },
            rapid: {
                name: 'Rapid Fire',
                description: 'Fast shooting, weak damage',
                cost: 8000,
                health: 70,
                maxSpeed: 8,
                minSpeed: 0.5,
                acceleration: 0.06,
                bulletDamage: 0.5,
                fireRate: 2.5,
                color: 0xffaa00
            },
            heavy: {
                name: 'Heavy Hitter',
                description: 'Massive damage, slow fire rate',
                cost: 12000,
                health: 120,
                maxSpeed: 6,
                minSpeed: 0.4,
                acceleration: 0.04,
                bulletDamage: 5,
                fireRate: 0.4,
                color: 0xff0000
            },
            elite: {
                name: 'Elite Fighter',
                description: 'Excellent at everything',
                cost: 20000,
                health: 130,
                maxSpeed: 10,
                minSpeed: 0.8,
                acceleration: 0.08,
                bulletDamage: 2,
                fireRate: 1.5,
                color: 0xffd700
            },
            stealth: {
                name: 'Stealth Ship',
                description: 'Small, fast, hard to hit',
                cost: 35000,
                health: 50,
                maxSpeed: 12,
                minSpeed: 1,
                acceleration: 0.12,
                bulletDamage: 1.5,
                fireRate: 1.2,
                color: 0x222222
            }
        };
    }

    loadPurchasedShips() {
        const saved = localStorage.getItem('spacetime3d_purchased');
        if (saved) {
            return JSON.parse(saved);
        }
        // Starter ship is free
        return ['starter'];
    }

    savePurchasedShips() {
        localStorage.setItem('spacetime3d_purchased', JSON.stringify(this.purchasedShips));
    }

    getTotalScore() {
        const saved = localStorage.getItem('spacetime3d_score');
        return saved ? parseInt(saved) : 0;
    }

    saveTotalScore(score) {
        const current = this.getTotalScore();
        localStorage.setItem('spacetime3d_score', (current + score).toString());
    }

    // ==================== MULTIPLAYER METHODS ====================

    connectToServer() {
        console.log('Connecting to server:', this.serverUrl);

        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            console.log('✅ Connected to server! ID:', this.socket.id);
            this.playerId = this.socket.id;
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
        });

        // Lobby events
        this.socket.on('lobbyCreated', (data) => {
            console.log('Lobby created:', data.code);
            this.lobbyCode = data.code;
            this.isHost = data.isHost;
            this.showLobby([]);
        });

        this.socket.on('lobbyJoined', (data) => {
            console.log('Joined lobby:', data);
            this.lobbyCode = data.code;
            this.isHost = data.isHost;
            // Add existing players (excluding yourself)
            const existingPlayers = data.players.filter(p => p.id !== this.playerId);
            this.showLobby(existingPlayers);
        });

        this.socket.on('lobbyError', (message) => {
            alert('Error: ' + message);
        });

        this.socket.on('playerJoined', (player) => {
            console.log('Player joined:', player.name);
            this.addPlayerToLobby(player);
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left');
            this.removePlayerFromLobby(playerId);
        });

        this.socket.on('playerReady', (data) => {
            this.updatePlayerReady(data.playerId, data.ready);
        });

        this.socket.on('allReady', () => {
            if (this.isHost) {
                const startBtn = document.getElementById('lobby-start-btn');
                if (startBtn) {
                    startBtn.style.display = 'block';
                    startBtn.textContent = 'START GAME NOW!';
                    startBtn.style.background = 'rgba(0, 255, 0, 0.3)';
                }
            }
        });

        this.socket.on('gameStarting', (data) => {
            console.log('Game starting with players:', data.players);
            this.multiplayer = true;
            this.hideLobby();
            this.startMultiplayerGame(data.players);
        });

        // Game events
        this.socket.on('playerMoved', (data) => {
            this.updateOtherPlayer(data);
        });

        this.socket.on('playerShot', (data) => {
            this.createOtherPlayerBullets(data);
        });

        this.socket.on('playerDamaged', (data) => {
            this.showPlayerDamage(data);
        });

        this.socket.on('playerDied', (data) => {
            this.handlePlayerDeath(data);
        });

        this.socket.on('playerRespawned', (data) => {
            this.respawnPlayer(data);
        });

        this.socket.on('scoreUpdate', (data) => {
            this.updatePlayerScore(data);
        });
    }

    createLobby() {
        const shipData = this.ships[this.currentShip];
        this.socket.emit('createLobby', {
            name: this.playerName,
            ship: this.currentShip,
            color: shipData.color
        });
    }

    joinLobby(code) {
        const shipData = this.ships[this.currentShip];
        this.socket.emit('joinLobby', {
            code: code.toUpperCase(),
            playerData: {
                name: this.playerName,
                ship: this.currentShip,
                color: shipData.color
            }
        });
    }

    showLobby(existingPlayers = []) {
        // Hide start screen, show lobby
        document.getElementById('start-screen').style.display = 'none';

        const lobbyHtml = `
            <div id="lobby-screen" style="
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at center, rgba(0, 20, 40, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 200;
                color: #00ffff;
            ">
                <h1 style="font-size: 64px; text-shadow: 0 0 40px #00ffff; margin-bottom: 20px;">
                    LOBBY
                </h1>
                <div style="font-size: 48px; color: #ffd700; text-shadow: 0 0 30px #ffd700; margin-bottom: 30px; letter-spacing: 8px;">
                    ${this.lobbyCode}
                </div>
                <p style="font-size: 20px; margin-bottom: 20px;">Share this code with friends!</p>
                <div id="lobby-players" style="display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; justify-content: center;"></div>
                <button id="lobby-ready-btn" style="
                    padding: 20px 60px;
                    font-size: 28px;
                    background: transparent;
                    border: 4px solid #00ff00;
                    color: #00ff00;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    text-shadow: 0 0 15px #00ff00;
                    margin-bottom: 20px;
                ">READY</button>
                <button id="lobby-start-btn" style="
                    padding: 20px 60px;
                    font-size: 28px;
                    background: transparent;
                    border: 4px solid #ffd700;
                    color: #ffd700;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                    text-shadow: 0 0 15px #ffd700;
                    ${this.isHost ? '' : 'display: none;'}
                ">START GAME</button>
                <button id="lobby-leave-btn" style="
                    padding: 15px 40px;
                    font-size: 20px;
                    background: transparent;
                    border: 3px solid #ff4444;
                    color: #ff4444;
                    cursor: pointer;
                    font-family: 'Courier New', monospace;
                ">LEAVE</button>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', lobbyHtml);

        // Event listeners
        document.getElementById('lobby-ready-btn').addEventListener('click', () => {
            this.socket.emit('toggleReady');
            document.getElementById('lobby-ready-btn').textContent = 'READY!';
            document.getElementById('lobby-ready-btn').style.borderColor = '#ffff00';
            document.getElementById('lobby-ready-btn').style.color = '#ffff00';
        });

        document.getElementById('lobby-start-btn').addEventListener('click', () => {
            this.socket.emit('startGame');
        });

        document.getElementById('lobby-leave-btn').addEventListener('click', () => {
            location.reload();
        });

        // Add existing players first
        existingPlayers.forEach(player => {
            this.addPlayerToLobby(player);
        });

        // Add yourself to lobby
        this.addPlayerToLobby({
            id: this.playerId,
            name: this.playerName + ' (You)',
            ship: this.currentShip,
            color: this.ships[this.currentShip].color,
            ready: false
        });
    }

    hideLobby() {
        const lobby = document.getElementById('lobby-screen');
        if (lobby) lobby.remove();
    }

    addPlayerToLobby(player) {
        const container = document.getElementById('lobby-players');
        if (!container) {
            console.error('No lobby-players container found!');
            return;
        }

        // Check if player already exists
        if (document.getElementById('player-' + player.id)) {
            console.log('Player', player.id, 'already in lobby');
            return;
        }

        // Convert color number to hex string
        let colorHex = '00ffff';
        if (player.color) {
            if (typeof player.color === 'number') {
                colorHex = player.color.toString(16).padStart(6, '0');
            } else {
                colorHex = player.color;
            }
        }

        const playerDiv = document.createElement('div');
        playerDiv.id = 'player-' + player.id;
        playerDiv.style.cssText = `
            background: rgba(0, 40, 80, 0.8);
            border: 3px solid #${colorHex};
            border-radius: 10px;
            padding: 15px 25px;
            text-align: center;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
        `;
        playerDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">${player.name}</div>
            <div class="ready-status" style="font-size: 16px; color: #ff4444;">Not Ready</div>
        `;

        container.appendChild(playerDiv);
        console.log('Added player to lobby:', player.name, 'with color:', colorHex);
    }

    removePlayerFromLobby(playerId) {
        const playerDiv = document.getElementById('player-' + playerId);
        if (playerDiv) playerDiv.remove();
    }

    updatePlayerReady(playerId, ready) {
        const playerDiv = document.getElementById('player-' + playerId);
        if (playerDiv) {
            const status = playerDiv.querySelector('.ready-status');
            if (status) {
                status.textContent = ready ? 'READY!' : 'Not Ready';
                status.style.color = ready ? '#00ff00' : '#ff4444';
            }
        }
    }

    startMultiplayerGame(playersData) {
        document.getElementById('start-screen').style.display = 'none';
        this.gameState = 'playing';
        this.thirdPerson = true;

        // Create your ship
        this.createShip();

        // Create other players' ships
        playersData.forEach(playerData => {
            if (playerData.id !== this.playerId) {
                this.createOtherPlayerShip(playerData);
            }
        });

        // Lock pointer
        document.body.requestPointerLock();

        // Spawn some enemies too
        for (let i = 0; i < 3; i++) {
            this.createEnemy();
        }

        console.log('Multiplayer game started!');
    }

    createOtherPlayerShip(playerData) {
        const ship = new THREE.Group();
        const mainColor = playerData.color || 0xcccccc;

        const mainMat = new THREE.MeshStandardMaterial({
            color: mainColor,
            metalness: 0.9,
            roughness: 0.3
        });

        const body = new THREE.Mesh(new THREE.ConeGeometry(2, 12, 8), mainMat);
        body.rotation.x = Math.PI / 2;
        ship.add(body);

        const cockpit = new THREE.Mesh(
            new THREE.SphereGeometry(1.5, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                metalness: 0.5,
                roughness: 0.1,
                transparent: true,
                opacity: 0.8,
                emissive: 0x004444,
                emissiveIntensity: 0.5
            })
        );
        cockpit.position.set(0, 1.5, 1);
        cockpit.scale.set(1, 0.6, 1.5);
        ship.add(cockpit);

        const wings = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 4), mainMat);
        wings.position.z = 2;
        ship.add(wings);

        // Player name tag
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 32px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(playerData.name || 'Pilot', 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 8;
        sprite.scale.set(10, 2.5, 1);
        ship.add(sprite);

        ship.position.set(
            playerData.position?.x || 0,
            playerData.position?.y || 0,
            playerData.position?.z || 0
        );

        this.scene.add(ship);
        this.otherPlayers.set(playerData.id, ship);
    }

    updateOtherPlayer(data) {
        const ship = this.otherPlayers.get(data.id);
        if (ship && data.id !== this.playerId) {
            // Smooth interpolation
            ship.position.lerp(new THREE.Vector3(data.position.x, data.position.y, data.position.z), 0.3);
            ship.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        }
    }

    createOtherPlayerBullets(data) {
        const ship = this.otherPlayers.get(data.playerId);
        if (!ship) return;

        data.bullets.forEach(bulletData => {
            const bullet = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.4, 5, 6),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );

            bullet.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
            bullet.rotation.set(bulletData.rotation.x, bulletData.rotation.y, bulletData.rotation.z);

            bullet.userData = {
                velocity: new THREE.Vector3(bulletData.velocity.x, bulletData.velocity.y, bulletData.velocity.z),
                lifetime: 150,
                damage: 1,
                fromPlayerId: data.playerId
            };

            bullet.rotation.x = Math.PI / 2;
            this.bullets.push(bullet);
            this.scene.add(bullet);
        });
    }

    showPlayerDamage(data) {
        // Flash effect when player gets hit
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, 0.3);
            pointer-events: none;
            z-index: 150;
            animation: damageFlash 0.2s ease-out forwards;
        `;
        document.body.appendChild(overlay);

        setTimeout(() => overlay.remove(), 200);

        // Update health
        this.health = data.newHealth;
        document.getElementById('health-bar').style.width = this.health + '%';

        if (this.health <= 0) {
            this.gameOver();
        }
    }

    handlePlayerDeath(data) {
        const ship = this.otherPlayers.get(data.playerId);
        if (ship) {
            this.createExplosion(ship.position.clone(), 0xff8800);
            ship.visible = false;
        }
    }

    respawnPlayer(data) {
        const ship = this.otherPlayers.get(data.playerId);
        if (ship) {
            ship.visible = true;
            ship.position.set(data.position.x, data.position.y, data.position.z);
        }
    }

    updatePlayerScore(data) {
        // Could show in a scoreboard
        console.log('Player', data.playerId, 'score:', data.score);
    }

    // ==================== END MULTIPLAYER METHODS ====================

    init() {
        // Scene with deep space
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000208);

        // Distance fog for depth
        this.scene.fog = new THREE.FogExp2(0x000208, 0.0006);

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
        this.camera.position.set(0, 2, 5);

        // Renderer with MAX quality settings
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Dramatic lighting setup
        const ambientLight = new THREE.AmbientLight(0x101030, 0.3);
        this.scene.add(ambientLight);

        // Bright sun light
        const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
        sunLight.position.set(800, 400, 300);
        this.scene.add(sunLight);

        // Multiple colorful lights for cinematic feel
        const cyanLight = new THREE.PointLight(0x00ffff, 1.0, 800);
        cyanLight.position.set(-300, 150, -500);
        this.scene.add(cyanLight);

        const magentaLight = new THREE.PointLight(0xff00ff, 0.8, 800);
        magentaLight.position.set(300, -150, -600);
        this.scene.add(magentaLight);

        const orangeLight = new THREE.PointLight(0xff6600, 0.6, 600);
        orangeLight.position.set(0, 300, -800);
        this.scene.add(orangeLight);

        // Player glow light
        this.playerLight = new THREE.PointLight(0x00ffff, 2.0, 200);
        this.scene.add(this.playerLight);

        // Create world
        this.createStarfield();
        this.createNebula();
        this.createAsteroids();
        this.createSpaceDust();
        this.createPlanets();
        this.createSun();

        console.log("World created!");

        // Start animation
        this.animate();
    }

    // Don't create ship in init - wait for game start

    createStarfield() {
        const geometry = new THREE.BufferGeometry();
        const count = 8000;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 3000;
            positions[i3 + 1] = (Math.random() - 0.5) * 3000;
            positions[i3 + 2] = (Math.random() - 0.5) * 3000;

            // Varied star colors (white, blue, yellow, red)
            const colorType = Math.random();
            if (colorType > 0.95) {
                colors[i3] = 1; colors[i3 + 1] = 0.6; colors[i3 + 2] = 0.6;
            } else if (colorType > 0.85) {
                colors[i3] = 0.7; colors[i3 + 1] = 0.8; colors[i3 + 2] = 1;
            } else if (colorType > 0.75) {
                colors[i3] = 1; colors[i3 + 1] = 1; colors[i3 + 2] = 0.7;
            } else {
                colors[i3] = 1; colors[i3 + 1] = 1; colors[i3 + 2] = 1;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: true
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createNebula() {
        // Create HUGE colorful nebula clouds
        const nebulaColors = [0x4400ff, 0xff0088, 0x00ffcc, 0xff4400, 0x8800ff];

        for (let n = 0; n < 8; n++) {
            const cloudGeom = new THREE.BufferGeometry();
            const cloudCount = 800;
            const positions = new Float32Array(cloudCount * 3);

            for (let i = 0; i < cloudCount * 3; i += 3) {
                positions[i] = (Math.random() - 0.5) * 2000;
                positions[i + 1] = (Math.random() - 0.5) * 2000;
                positions[i + 2] = (Math.random() - 0.5) * 2000 - 1500 - n * 400;
            }

            cloudGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const cloudMat = new THREE.PointsMaterial({
                color: nebulaColors[n % nebulaColors.length],
                size: 40 + Math.random() * 30,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending
            });

            const cloud = new THREE.Points(cloudGeom, cloudMat);
            this.scene.add(cloud);
        }
    }

    createPlanets() {
        // Add some distant planets for realism
        const planetData = [
            { size: 150, color: 0xff4422, pos: [-1200, 400, -2000], emissive: 0xff2200 },
            { size: 200, color: 0x4488ff, pos: [1500, -300, -2500], emissive: 0x2244aa },
            { size: 80, color: 0xaaaaaa, pos: [-800, -500, -1500], emissive: 0x333333 },
            { size: 300, color: 0xffaa00, pos: [2000, 600, -3000], emissive: 0xcc6600 }
        ];

        planetData.forEach(p => {
            const geom = new THREE.SphereGeometry(p.size, 32, 32);
            const mat = new THREE.MeshStandardMaterial({
                color: p.color,
                emissive: p.emissive,
                emissiveIntensity: 0.3,
                roughness: 0.8,
                metalness: 0.2
            });
            const planet = new THREE.Mesh(geom, mat);
            planet.position.set(...p.pos);
            this.scene.add(planet);
        });
    }

    createSun() {
        // Create a massive distant sun
        const sunGeom = new THREE.SphereGeometry(400, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 0.9
        });
        const sun = new THREE.Mesh(sunGeom, sunMat);
        sun.position.set(-3000, 1000, -5000);
        this.scene.add(sun);

        // Sun glow
        const glowGeom = new THREE.SphereGeometry(500, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.copy(sun.position);
        this.scene.add(glow);
    }

    createSpaceDust() {
        const geometry = new THREE.BufferGeometry();
        const count = 1000;
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 600;
            positions[i + 1] = (Math.random() - 0.5) * 600;
            positions[i + 2] = (Math.random() - 0.5) * 600;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x888888,
            size: 1,
            transparent: true,
            opacity: 0.5
        });

        this.spaceDust = new THREE.Points(geometry, material);
        this.scene.add(this.spaceDust);
    }

    createAsteroids() {
        for (let i = 0; i < 30; i++) {
            const size = 5 + Math.random() * 15;
            const geometry = new THREE.DodecahedronGeometry(size, 0);
            const material = new THREE.MeshPhongMaterial({
                color: 0x555555,
                flatShading: true
            });

            const asteroid = new THREE.Mesh(geometry, material);
            asteroid.position.set(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 200,
                -200 - Math.random() * 600
            );

            asteroid.userData = {
                rotX: (Math.random() - 0.5) * 0.01,
                rotY: (Math.random() - 0.5) * 0.01
            };

            this.scene.add(asteroid);
        }
    }

    createShip() {
        const shipData = this.ships[this.currentShip];

        // Apply ship stats
        this.health = shipData.health;
        this.maxSpeed = shipData.maxSpeed;
        this.minSpeed = shipData.minSpeed;
        this.acceleration = shipData.acceleration;
        this.bulletDamage = shipData.bulletDamage;
        this.fireRate = shipData.fireRate;
        this.speed = (this.maxSpeed + this.minSpeed) / 2;

        this.ship = new THREE.Group();

        const mainColor = shipData.color;

        // More realistic materials
        const mainMat = new THREE.MeshStandardMaterial({
            color: mainColor,
            metalness: 0.9,
            roughness: 0.3,
            envMapIntensity: 1.5
        });

        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.6
        });

        const cockpitMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.8,
            emissive: 0x004444,
            emissiveIntensity: 0.5
        });

        const glowMat = new THREE.MeshBasicMaterial({
            color: mainColor,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        // Different ship designs based on type
        if (this.currentShip === 'speed') {
            // Sleek, fast ship
            const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 16, 6), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const wings = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2), mainMat);
            wings.position.z = 2;
            this.ship.add(wings);

        } else if (this.currentShip === 'tank') {
            // Big, bulky ship
            const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 15), mainMat);
            this.ship.add(body);

            const armor1 = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 8), darkMat);
            armor1.position.set(0, 2, 2);
            this.ship.add(armor1);

            const armor2 = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 8), darkMat);
            armor2.position.set(0, -2, 2);
            this.ship.add(armor2);

        } else if (this.currentShip === 'sniper') {
            // Long, thin ship
            const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 20, 6), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), cockpitMat);
            cockpit.position.z = 5;
            this.ship.add(cockpit);

        } else if (this.currentShip === 'rapid') {
            // Wide ship with multiple guns
            const body = new THREE.Mesh(new THREE.ConeGeometry(2.5, 10, 6), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const wings = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 5), mainMat);
            wings.position.z = 1;
            this.ship.add(wings);

            // Gun pods
            [-5, 5].forEach(x => {
                const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), darkMat);
                gun.rotation.x = Math.PI / 2;
                gun.position.set(x, 0, -6);
                this.ship.add(gun);
            });

        } else if (this.currentShip === 'heavy') {
            // Massive ship
            const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 18), mainMat);
            this.ship.add(body);

            const cannon = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 6), darkMat);
            cannon.rotation.x = Math.PI / 2;
            cannon.position.z = -10;
            this.ship.add(cannon);

        } else if (this.currentShip === 'elite') {
            // Fancy, balanced ship
            const body = new THREE.Mesh(new THREE.ConeGeometry(2.5, 14, 8), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const cockpit = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), cockpitMat);
            cockpit.position.set(0, 1.5, 1);
            cockpit.scale.set(1, 0.6, 1.5);
            this.ship.add(cockpit);

            const wings = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 6), mainMat);
            wings.position.z = 2;
            this.ship.add(wings);

            // Wing details
            const wingGeom = new THREE.BoxGeometry(0.5, 1.5, 4);
            [-6, 6].forEach(x => {
                const wing = new THREE.Mesh(wingGeom, darkMat);
                wing.position.set(x, -0.8, 2);
                this.ship.add(wing);
            });

        } else if (this.currentShip === 'stealth') {
            // Small, angular ship
            const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 10, 4), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const wings = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 3), mainMat);
            wings.position.z = 1;
            this.ship.add(wings);

        } else {
            // Starter ship (original design)
            const body = new THREE.Mesh(new THREE.ConeGeometry(2, 12, 8), mainMat);
            body.rotation.x = Math.PI / 2;
            this.ship.add(body);

            const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), cockpitMat);
            cockpit.position.set(0, 1.5, 1);
            cockpit.scale.set(1, 0.6, 1.5);
            this.ship.add(cockpit);

            const wings = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 4), mainMat);
            wings.position.z = 2;
            this.ship.add(wings);

            const tipGeom = new THREE.BoxGeometry(0.5, 1, 3);
            const leftTip = new THREE.Mesh(tipGeom, darkMat);
            leftTip.position.set(-5.8, -0.3, 2);
            this.ship.add(leftTip);

            const rightTip = new THREE.Mesh(tipGeom, darkMat);
            rightTip.position.set(5.8, -0.3, 2);
            this.ship.add(rightTip);
        }

        // Engine glow (all ships)
        const glowGeom = new THREE.CircleGeometry(0.8, 8);
        const leftGlow = new THREE.Mesh(glowGeom, glowMat);
        leftGlow.rotation.y = Math.PI;
        leftGlow.position.set(-2, 0, 6);
        this.ship.add(leftGlow);

        const rightGlow = new THREE.Mesh(glowGeom, glowMat);
        rightGlow.rotation.y = Math.PI;
        rightGlow.position.set(2, 0, 6);
        this.ship.add(rightGlow);

        this.ship.position.set(0, 0, 0);
        this.scene.add(this.ship);
        console.log("Created " + shipData.name + "!");
    }

    createEngineTrail() {
        const shipData = this.ships[this.currentShip];

        // Engine positions (behind the ship)
        const enginePositions = [[-2, 0, 6], [2, 0, 6]];

        enginePositions.forEach(pos => {
            const trail = new THREE.Mesh(
                new THREE.SphereGeometry(0.8, 4, 4),
                new THREE.MeshBasicMaterial({
                    color: shipData.color,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                })
            );

            // Position at engine
            const engineWorld = new THREE.Vector3(pos[0], pos[1], pos[2]);
            engineWorld.applyQuaternion(this.ship.quaternion);
            trail.position.copy(this.ship.position).add(engineWorld);

            trail.userData = { life: 40 };
            this.engineTrails.push(trail);
            this.scene.add(trail);
        });
    }

    createEnemy() {
        const group = new THREE.Group();

        // Body
        const body = new THREE.Mesh(
            new THREE.ConeGeometry(4, 12, 6),
            new THREE.MeshPhongMaterial({ color: 0xff0000, flatShading: true })
        );
        body.rotation.x = Math.PI;
        group.add(body);

        // Wings
        const wings = new THREE.Mesh(
            new THREE.BoxGeometry(18, 1, 6),
            new THREE.MeshPhongMaterial({ color: 0xaa0000, flatShading: true })
        );
        wings.position.z = 3;
        group.add(wings);

        group.position.set(
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 150,
            -400 - Math.random() * 200
        );

        group.userData = {
            speed: 0.3,
            health: 3,
            shootTimer: 100 + Math.random() * 50,
            shootInterval: 120 + Math.random() * 60,
            preferredDistance: 200 + Math.random() * 100,
            strafeDirection: Math.random() > 0.5 ? 1 : -1
        };

        this.enemies.push(group);
        this.scene.add(group);
    }

    shoot() {
        if (this.gameState !== 'playing') return;
        if (this.shootTimer > 0) return;

        const shipData = this.ships[this.currentShip];
        const bulletColor = shipData.color;

        // Create two bullets from wing tips
        const bulletsData = []; // Store for multiplayer

        [-3, 3].forEach(xOffset => {
            const bullet = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.4, 5, 6),
                new THREE.MeshBasicMaterial({ color: bulletColor })
            );

            // Get ship's forward direction (exactly where you're aiming)
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.ship.quaternion);

            // Position bullets at wing tips
            const rightOffset = new THREE.Vector3(xOffset, 0, 0);
            rightOffset.applyQuaternion(this.ship.quaternion);

            bullet.position.copy(this.ship.position);
            bullet.position.add(forward.clone().multiplyScalar(8));
            bullet.position.add(rightOffset);

            const velocity = forward.clone().multiplyScalar(this.speed + 4);

            bullet.userData = {
                velocity: velocity,
                lifetime: 150,
                damage: this.bulletDamage
            };

            bullet.rotation.x = Math.PI / 2;
            bullet.quaternion.copy(this.ship.quaternion);
            this.bullets.push(bullet);
            this.scene.add(bullet);

            // Store for multiplayer
            bulletsData.push({
                position: {
                    x: bullet.position.x,
                    y: bullet.position.y,
                    z: bullet.position.z
                },
                rotation: {
                    x: bullet.rotation.x,
                    y: bullet.rotation.y,
                    z: bullet.rotation.z
                },
                velocity: {
                    x: velocity.x,
                    y: velocity.y,
                    z: velocity.z
                }
            });
        });

        // MULTIPLAYER: Send shoot event to server
        if (this.multiplayer && this.socket) {
            this.socket.emit('playerShoot', { bullets: bulletsData });
        }

        // Reset shoot timer based on fire rate
        this.shootTimer = Math.max(5, 20 / this.fireRate);
    }

    enemyShoot(enemy) {
        const bullet = new THREE.Mesh(
            new THREE.SphereGeometry(1, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff4444 })
        );

        bullet.position.copy(enemy.position);

        // Direction toward player with bad aim
        const dir = new THREE.Vector3();
        dir.subVectors(this.ship.position, enemy.position).normalize();

        // Add bad aim - random offset
        dir.x += (Math.random() - 0.5) * 0.8;  // Bad aim!
        dir.y += (Math.random() - 0.5) * 0.8;
        dir.z += (Math.random() - 0.5) * 0.3;
        dir.normalize();

        bullet.userData = {
            velocity: dir.multiplyScalar(2),
            lifetime: 200
        };

        this.enemyBullets.push(bullet);
        this.scene.add(bullet);
    }

    createExplosion(pos, color = 0xff8800) {
        // EPIC explosion with way more particles!
        for (let i = 0; i < 40; i++) {
            const p = new THREE.Mesh(
                new THREE.SphereGeometry(2 + Math.random() * 4, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending
                })
            );
            p.position.copy(pos);
            p.userData = {
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5
                ),
                life: 80,
                maxLife: 80
            };
            this.particles.push(p);
            this.scene.add(p);
        }

        // Add bright white core flash
        for (let i = 0; i < 15; i++) {
            const flash = new THREE.Mesh(
                new THREE.SphereGeometry(1, 4, 4),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending
                })
            );
            flash.position.copy(pos);
            flash.userData = {
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8
                ),
                life: 30,
                maxLife: 30
            };
            this.particles.push(flash);
            this.scene.add(flash);
        }
    }

    setupEventListeners() {
        document.addEventListener('mousemove', (e) => {
            // Use pointer lock movement if available, otherwise use normal mouse position
            if (document.pointerLockElement) {
                // Accumulate mouse movement for unlimited rotation - BETTER SENSITIVITY!
                this.mouse.x += e.movementX * 0.003;
                this.mouse.y += e.movementY * 0.003;

                // Clamp pitch (up/down) but allow unlimited yaw (left/right)
                this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y));
                // Don't clamp x - let it rotate freely!
            } else {
                this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
            }
        });

        document.addEventListener('click', () => {
            if (this.gameState === 'playing') this.shoot();
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Open shop with B key
            if (e.code === 'KeyB' && this.gameState !== 'playing') {
                this.openShop();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame(false); // Single player
        });

        document.getElementById('create-lobby-btn').addEventListener('click', () => {
            if (!this.socket) {
                this.connectToServer();
                setTimeout(() => this.createLobby(), 500);
            } else {
                this.createLobby();
            }
        });

        document.getElementById('join-lobby-btn').addEventListener('click', () => {
            const code = document.getElementById('lobby-code-input').value.trim();
            if (code.length === 6) {
                if (!this.socket) {
                    this.connectToServer();
                    setTimeout(() => this.joinLobby(code), 500);
                } else {
                    this.joinLobby(code);
                }
            } else {
                alert('Please enter a valid 6-character lobby code!');
            }
        });

        document.getElementById('shop-btn').addEventListener('click', () => {
            this.openShop();
        });

        document.getElementById('shop-back-btn').addEventListener('click', () => {
            this.closeShop();
        });
    }

    startGame(multiplayer = false) {
        console.log("Starting game..." + (multiplayer ? " MULTIPLAYER!" : " SINGLE PLAYER"));
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('ship-shop').style.display = 'none';
        this.gameState = 'playing';
        this.multiplayer = multiplayer;
        this.thirdPerson = true;

        // Create the player's ship
        this.createShip();

        // Lock pointer
        document.body.requestPointerLock();

        for (let i = 0; i < 3; i++) {
            this.createEnemy();
        }
    }

    update() {
        if (this.gameState !== 'playing') return;

        const delta = this.clock.getDelta();

        // Don't update if ship doesn't exist yet
        if (!this.ship) return;

        // Invincibility
        if (this.invincible > 0) this.invincible--;

        // Shoot timer
        if (this.shootTimer > 0) this.shootTimer--;

        // Ship movement - Battlefront style!
        // W/S control speed (throttle)
        if (this.keys['KeyW']) {
            this.speed = Math.min(this.speed + this.acceleration * 2, this.maxSpeed);
        }
        if (this.keys['KeyS']) {
            this.speed = Math.max(this.speed - this.acceleration * 2, this.minSpeed);
        }

        // Mouse controls ship direction (pitch and yaw) - IMPROVED!
        const targetPitch = -this.mouse.y * 1.8;
        const targetYaw = -this.mouse.x * 2.2;

        // Smooth rotation - more responsive now!
        this.shipRotation.x += (targetPitch - this.shipRotation.x) * 0.13;
        this.shipRotation.y += (targetYaw - this.shipRotation.y) * 0.13;

        // Q/E for rolling (smoother and faster)
        if (this.keys['KeyQ']) {
            this.manualRoll -= 0.1;
        }
        if (this.keys['KeyE']) {
            this.manualRoll += 0.1;
        }

        // Clamp manual roll
        this.manualRoll = Math.max(-2.5, Math.min(2.5, this.manualRoll));

        // Smooth banking with your manual roll
        const targetBank = -this.mouse.x * 0.6 + this.manualRoll;
        this.shipRotation.z += (targetBank - this.shipRotation.z) * 0.12;

        // Apply rotation to ship
        this.ship.rotation.set(
            this.shipRotation.x,
            this.shipRotation.y,
            this.shipRotation.z
        );

        // Update crosshair position to show where bullets will go
        const crosshair = document.getElementById('crosshair');
        if (crosshair && this.ship && this.camera) {
            // Get ship's forward direction (where bullets go)
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.ship.quaternion);

            // Start from ship position and go forward
            const shipPos = this.ship.position.clone();
            const aimPoint = shipPos.clone().add(forward.multiplyScalar(100));

            // Project both points to screen
            shipPos.project(this.camera);
            aimPoint.project(this.camera);

            // Convert to screen coordinates
            const x = (aimPoint.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-aimPoint.y * 0.5 + 0.5) * window.innerHeight;

            crosshair.style.left = x + 'px';
            crosshair.style.top = y + 'px';
        }

        // Move ship forward based on speed and rotation
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.ship.quaternion);
        this.ship.position.add(forward.multiplyScalar(this.speed));

        // Keep ship in bounds (looser bounds - removed Z bound so you can fly anywhere!)
        this.ship.position.x = Math.max(-800, Math.min(800, this.ship.position.x));
        this.ship.position.y = Math.max(-400, Math.min(400, this.ship.position.y));
        // No Z bound - let player fly anywhere!

        // Update player light position
        if (this.playerLight) {
            this.playerLight.position.copy(this.ship.position);
        }

        // MULTIPLAYER: Send position to server
        if (this.multiplayer && this.socket && this.ship) {
            this.socket.emit('playerUpdate', {
                position: {
                    x: this.ship.position.x,
                    y: this.ship.position.y,
                    z: this.ship.position.z
                },
                rotation: {
                    x: this.ship.rotation.x,
                    y: this.ship.rotation.y,
                    z: this.ship.rotation.z
                },
                velocity: {
                    x: this.velocity.x,
                    y: this.velocity.y,
                    z: this.velocity.z
                },
                speed: this.speed
            });
        }

        // Animate space dust for sense of speed
        if (this.spaceDust && this.ship) {
            const positions = this.spaceDust.geometry.attributes.position.array;
            const shipForward = new THREE.Vector3(0, 0, -1);
            shipForward.applyQuaternion(this.ship.quaternion);

            for (let i = 0; i < positions.length; i += 3) {
                // Move dust opposite to ship movement
                positions[i] -= shipForward.x * this.speed * 2;
                positions[i + 1] -= shipForward.y * this.speed * 2;
                positions[i + 2] -= shipForward.z * this.speed * 2;

                // Reset dust that's too far
                if (Math.abs(positions[i] - this.ship.position.x) > 300 ||
                    Math.abs(positions[i + 1] - this.ship.position.y) > 300 ||
                    Math.abs(positions[i + 2] - this.ship.position.z) > 300) {
                    positions[i] = this.ship.position.x + (Math.random() - 0.5) * 600;
                    positions[i + 1] = this.ship.position.y + (Math.random() - 0.5) * 600;
                    positions[i + 2] = this.ship.position.z + (Math.random() - 0.5) * 600;
                }
            }

            this.spaceDust.geometry.attributes.position.needsUpdate = true;
        }

        // Create engine trail particles (less frequent for performance)
        this.trailTimer++;
        if (this.trailTimer > 8 && this.engineTrails.length < 50) {
            this.trailTimer = 0;
            this.createEngineTrail();
        }

        // Update engine trails
        for (let i = this.engineTrails.length - 1; i >= 0; i--) {
            const trail = this.engineTrails[i];
            trail.userData.life--;
            trail.material.opacity = trail.userData.life / 40;
            trail.scale.multiplyScalar(0.95);

            if (trail.userData.life <= 0) {
                this.scene.remove(trail);
                this.engineTrails.splice(i, 1);
            }
        }

        // Camera follows ship (third person - behind and above ship)
        const cameraOffset = new THREE.Vector3(0, 8, 25);
        cameraOffset.applyQuaternion(this.ship.quaternion);
        this.camera.position.copy(this.ship.position).add(cameraOffset);
        this.camera.lookAt(this.ship.position.clone().add(forward));

        // Player bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.position.add(b.userData.velocity);
            b.userData.lifetime--;

            if (b.userData.lifetime <= 0) {
                this.scene.remove(b);
                this.bullets.splice(i, 1);
            }
        }

        // Enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.position.add(b.userData.velocity);
            b.userData.lifetime--;

            // Check if hits player
            if (b.position.distanceTo(this.ship.position) < 8 && this.invincible <= 0) {
                this.health -= 15;
                this.invincible = 30;
                this.scene.remove(b);
                this.enemyBullets.splice(i, 1);
                this.createExplosion(b.position.clone(), 0xff0000);

                if (this.health <= 0) {
                    this.gameOver();
                }
                continue;
            }

            if (b.userData.lifetime <= 0) {
                this.scene.remove(b);
                this.enemyBullets.splice(i, 1);
            }
        }

        // Enemies
        if (this.enemies.length < 3 + Math.floor(this.score / 500)) {
            if (Math.random() < 0.01) this.createEnemy();
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            // Smart enemy AI - keep distance and strafe!
            const distanceToPlayer = e.position.distanceTo(this.ship.position);
            const dir = new THREE.Vector3();
            dir.subVectors(this.ship.position, e.position);

            // If too far, move closer
            if (distanceToPlayer > e.userData.preferredDistance + 50) {
                dir.normalize();
                e.position.add(dir.multiplyScalar(e.userData.speed * 1.5));
            }
            // If too close, back away
            else if (distanceToPlayer < e.userData.preferredDistance - 50) {
                dir.normalize().negate();
                e.position.add(dir.multiplyScalar(e.userData.speed * 1.5));
            }
            // At good distance - strafe around player
            else {
                // Create strafe direction (perpendicular to direction to player)
                const strafe = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
                strafe.multiplyScalar(e.userData.speed * 0.8 * e.userData.strafeDirection);
                e.position.add(strafe);
            }

            // Look at player
            e.lookAt(this.ship.position);

            // Enemy shooting (with bad aim)
            e.userData.shootTimer--;
            if (e.userData.shootTimer <= 0 && distanceToPlayer < 400) {
                this.enemyShoot(e);
                e.userData.shootTimer = e.userData.shootInterval;
            }

            // Hit by bullets
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                if (e.position.distanceTo(b.position) < 10) {
                    e.userData.health -= b.userData.damage;
                    this.scene.remove(b);
                    this.bullets.splice(j, 1);

                    if (e.userData.health <= 0) {
                        this.scene.remove(e);
                        this.enemies.splice(i, 1);
                        this.score += 100;
                        this.createExplosion(e.position.clone());
                    }
                    break;
                }
            }

            // Player collision
            if (e.position.distanceTo(this.ship.position) < 10 && this.invincible <= 0) {
                this.health -= 20;
                this.invincible = 60;
                this.scene.remove(e);
                this.enemies.splice(i, 1);
                this.createExplosion(e.position.clone(), 0xff0000);

                if (this.health <= 0) {
                    this.gameOver();
                }
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.add(p.userData.vel);
            p.userData.life--;

            // Fade out smoothly
            const lifePercent = p.userData.life / p.userData.maxLife;
            p.material.opacity = lifePercent;
            p.scale.multiplyScalar(1.02); // Expand slightly

            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
            }
        }

        // Update HUD
        document.getElementById('score').textContent = this.score;
        document.getElementById('health-bar').style.width = this.health + '%';
        document.getElementById('speed').textContent = this.speed.toFixed(1);

        // Update minimap
        this.updateMinimap();

        // Rotate starfield slowly
        if (this.starfield) {
            this.starfield.rotation.z += 0.0001;
        }
    }

    gameOver() {
        this.gameState = 'gameover';

        // Save score
        this.saveTotalScore(this.score);

        alert('GAME OVER!\nScore: ' + this.score + '\n\nPress OK to continue');

        // Exit pointer lock and reload
        document.exitPointerLock();
        location.reload();
    }

    updateMinimap() {
        if (!this.minimapCtx || !this.ship) return;

        const ctx = this.minimapCtx;
        const canvas = this.minimapCanvas;
        const scale = 0.05;

        // Clear
        ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
        for (let i = 0; i < canvas.width; i += 30) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Enemies as red dots
        ctx.fillStyle = '#ff0000';
        this.enemies.forEach(enemy => {
            const relX = (enemy.position.x - this.ship.position.x) * scale + centerX;
            const relZ = (enemy.position.z - this.ship.position.z) * scale + centerY;

            if (relX > 0 && relX < canvas.width && relZ > 0 && relZ < canvas.height) {
                ctx.beginPath();
                ctx.arc(relX, relZ, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Player in center (cyan)
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    openShop() {
        this.renderShop();
        document.getElementById('ship-shop').style.display = 'flex';
    }

    closeShop() {
        document.getElementById('ship-shop').style.display = 'none';
    }

    renderShop() {
        const grid = document.getElementById('ships-grid');
        grid.innerHTML = '';

        const totalPoints = this.getTotalScore();
        document.getElementById('total-points').textContent = totalPoints;

        Object.entries(this.ships).forEach(([shipId, shipData]) => {
            const isPurchased = this.purchasedShips.includes(shipId);
            const isSelected = this.currentShip === shipId;
            const canAfford = totalPoints >= shipData.cost;

            const card = document.createElement('div');
            card.className = 'ship-card';
            if (!isPurchased) card.classList.add('locked');
            if (isSelected) card.classList.add('selected');

            card.style.borderColor = '#' + shipData.color.toString(16).padStart(6, '0');

            card.innerHTML = `
                <h3 style="color: #${shipData.color.toString(16).padStart(6, '0')}">${shipData.name}</h3>
                <p>${shipData.description}</p>
                <div class="ship-stats">
                    <div class="stat">
                        <span>Health:</span>
                        <span>${shipData.health}</span>
                    </div>
                    <div class="stat">
                        <span>Speed:</span>
                        <span>${shipData.maxSpeed}</span>
                    </div>
                    <div class="stat">
                        <span>Damage:</span>
                        <span>${shipData.bulletDamage}x</span>
                    </div>
                    <div class="stat">
                        <span>Fire Rate:</span>
                        <span>${shipData.fireRate}x</span>
                    </div>
                </div>
                <div class="ship-price">${shipData.cost === 0 ? 'FREE' : shipData.cost + ' pts'}</div>
            `;

            if (isPurchased) {
                if (isSelected) {
                    const btn = document.createElement('button');
                    btn.className = 'select-btn';
                    btn.textContent = '✓ SELECTED';
                    btn.disabled = true;
                    card.appendChild(btn);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'select-btn';
                    btn.textContent = 'SELECT SHIP';
                    btn.onclick = () => this.selectShip(shipId);
                    card.appendChild(btn);
                }
            } else {
                const btn = document.createElement('button');
                btn.className = 'buy-btn';
                btn.textContent = 'BUY SHIP';
                btn.disabled = !canAfford;
                btn.onclick = () => this.buyShip(shipId, shipData.cost);
                card.appendChild(btn);
            }

            grid.appendChild(card);
        });
    }

    buyShip(shipId, cost) {
        const totalPoints = this.getTotalScore();
        if (totalPoints >= cost) {
            this.purchasedShips.push(shipId);
            this.savePurchasedShips();

            // Deduct points
            localStorage.setItem('spacetime3d_score', (totalPoints - cost).toString());

            // Re-render shop
            this.renderShop();
            alert('Purchased ' + this.ships[shipId].name + '!');
        }
    }

    selectShip(shipId) {
        this.currentShip = shipId;
        this.renderShop();
        console.log('Selected ' + this.ships[shipId].name);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    console.log("Page loaded, creating game...");
    try {
        new SpaceGame3D();
    } catch (error) {
        console.error("Failed to create game:", error);
        alert("Could not start game: " + error.message);
    }
});
