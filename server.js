// SPACETIME 3D - MULTIPLAYER SERVER
// This is the "brain" that connects all players!

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Cloud hosting uses their own port (Render provides PORT env variable)
const PORT = process.env.PORT || 3000;

// Store all game data
const lobbies = new Map(); // All lobbies
const players = new Map(); // All connected players
const playerLobby = new Map(); // Which lobby each player is in

// Generate a random room code (like "ABC123")
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Create a new lobby
function createLobby(hostId, hostName) {
    const code = generateRoomCode();

    // Make sure code is unique
    while (lobbies.has(code)) {
        return createLobby(hostId, hostName);
    }

    const lobby = {
        code: code,
        host: hostId,
        players: [],
        gameState: 'lobby', // 'lobby', 'playing', 'gameover'
        maxPlayers: 30,
        createdAt: Date.now()
    };

    lobbies.set(code, lobby);
    console.log(`🎮 New lobby created: ${code} by ${hostName}`);
    return code;
}

// Add player to lobby
function joinLobby(socket, code, playerData) {
    const lobby = lobbies.get(code);

    if (!lobby) {
        return { success: false, message: 'Lobby not found' };
    }

    if (lobby.players.length >= lobby.maxPlayers) {
        return { success: false, message: 'Lobby is full' };
    }

    // Create player object
    const player = {
        id: socket.id,
        name: playerData.name || 'Pilot',
        ship: playerData.ship || 'starter',
        color: playerData.color || 0xcccccc,
        ready: false,
        score: 0,
        health: 100,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 }
    };

    lobby.players.push(player);
    playerLobby.set(socket.id, code);
    players.set(socket.id, player);

    // Join the socket room
    socket.join(code);

    console.log(`✈️ ${player.name} joined lobby ${code}`);

    // Tell everyone in lobby about the new player
    io.to(code).emit('playerJoined', player);

    // Send lobby info to new player
    return {
        success: true,
        code: code,
        players: lobby.players,
        host: lobby.host
    };
}

// Remove player from lobby
function leaveLobby(socket) {
    const playerId = socket.id;
    const code = playerLobby.get(playerId);

    if (!code) return;

    const lobby = lobbies.get(code);
    if (!lobby) return;

    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    players.delete(playerId);
    playerLobby.delete(playerId);

    socket.leave(code);

    // Tell everyone
    io.to(code).emit('playerLeft', playerId);

    // If host left, assign new host or close lobby
    if (lobby.host === playerId) {
        if (lobby.players.length > 0) {
            lobby.host = lobby.players[0].id;
            io.to(code).emit('newHost', lobby.host);
        } else {
            lobbies.delete(code);
            console.log(`🗑️ Lobby ${code} closed (empty)`);
            return;
        }
    }

    console.log(`👋 Player ${playerId} left lobby ${code}`);
}

// SOCKET.IO CONNECTIONS
io.on('connection', (socket) => {
    console.log(`🔌 Player connected: ${socket.id}`);

    // Create a new lobby
    socket.on('createLobby', (playerData) => {
        const code = createLobby(socket.id, playerData.name || 'Host');
        const result = joinLobby(socket, code, playerData);

        if (result.success) {
            socket.emit('lobbyCreated', {
                code: code,
                isHost: true
            });
        }
    });

    // Join an existing lobby
    socket.on('joinLobby', (data) => {
        const result = joinLobby(socket, data.code, data.playerData);

        if (result.success) {
            socket.emit('lobbyJoined', {
                code: data.code,
                players: result.players,
                isHost: false
            });
        } else {
            socket.emit('lobbyError', result.message);
        }
    });

    // Player toggles ready status
    socket.on('toggleReady', () => {
        const playerId = socket.id;
        const code = playerLobby.get(playerId);

        if (!code) return;

        const lobby = lobbies.get(code);
        const player = lobby.players.find(p => p.id === playerId);

        if (player) {
            player.ready = !player.ready;
            io.to(code).emit('playerReady', {
                playerId: playerId,
                ready: player.ready
            });

            // Check if all players are ready
            const allReady = lobby.players.length >= 2 &&
                lobby.players.every(p => p.ready);

            if (allReady && lobby.gameState === 'lobby') {
                io.to(code).emit('allReady', true);
            }
        }
    });

    // Host starts the game
    socket.on('startGame', () => {
        const code = playerLobby.get(socket.id);

        if (!code) return;

        const lobby = lobbies.get(code);

        // Only host can start
        if (lobby.host !== socket.id) {
            socket.emit('error', 'Only host can start the game');
            return;
        }

        lobby.gameState = 'playing';
        io.to(code).emit('gameStarting', {
            players: lobby.players
        });

        console.log(`🚀 Game starting in lobby ${code}`);
    });

    // GAME: Player position update
    socket.on('playerUpdate', (data) => {
        const playerId = socket.id;
        const code = playerLobby.get(playerId);

        if (!code) return;

        const lobby = lobbies.get(code);
        const player = lobby.players.find(p => p.id === playerId);

        if (player && lobby.gameState === 'playing') {
            // Update player data
            player.position = data.position;
            player.rotation = data.rotation;
            player.velocity = data.velocity;
            player.speed = data.speed;

            // Broadcast to other players in lobby
            socket.to(code).emit('playerMoved', {
                id: playerId,
                ...data
            });
        }
    });

    // GAME: Player shoots
    socket.on('playerShoot', (data) => {
        const playerId = socket.id;
        const code = playerLobby.get(playerId);

        if (!code) return;

        const lobby = lobbies.get(code);

        if (lobby.gameState === 'playing') {
            // Tell everyone else about the shot
            socket.to(code).emit('playerShot', {
                playerId: playerId,
                bullets: data.bullets
            });
        }
    });

    // GAME: Player hit by bullet
    socket.on('playerHit', (data) => {
        const code = playerLobby.get(socket.id);
        if (!code) return;

        const lobby = lobbies.get(code);
        const targetPlayer = lobby.players.find(p => p.id === data.targetId);

        if (targetPlayer) {
            targetPlayer.health -= data.damage;

            // Tell everyone about the hit
            io.to(code).emit('playerDamaged', {
                targetId: data.targetId,
                damage: data.damage,
                newHealth: targetPlayer.health,
                shooterId: data.shooterId
            });

            // Update score
            const shooter = lobby.players.find(p => p.id === data.shooterId);
            if (shooter) {
                shooter.score += 10;
            }

            // Check if player died
            if (targetPlayer.health <= 0) {
                io.to(code).emit('playerDied', {
                    playerId: data.targetId,
                    killerId: data.shooterId
                });

                // Respawn after delay
                setTimeout(() => {
                    targetPlayer.health = 100;
                    targetPlayer.score -= 50; // Penalty for dying
                    io.to(code).emit('playerRespawned', {
                        playerId: data.targetId,
                        position: {
                            x: (Math.random() - 0.5) * 200,
                            y: (Math.random() - 0.5) * 100,
                            z: 0
                        }
                    });
                }, 3000);
            }
        }
    });

    // GAME: Enemy killed (co-op points)
    socket.on('enemyKilled', (data) => {
        const code = playerLobby.get(socket.id);
        if (!code) return;

        const lobby = lobbies.get(code);
        const player = lobby.players.find(p => p.id === socket.id);

        if (player) {
            player.score += data.score || 100;

            // Tell everyone about the score update
            io.to(code).emit('scoreUpdate', {
                playerId: socket.id,
                score: player.score
            });
        }
    });

    // Chat message
    socket.on('chatMessage', (data) => {
        const code = playerLobby.get(socket.id);
        if (!code) return;

        const player = players.get(socket.id);

        io.to(code).emit('chatMessage', {
            playerId: socket.id,
            playerName: player ? player.name : 'Unknown',
            message: data.message
        });
    });

    // Player disconnects
    socket.on('disconnect', () => {
        console.log(`🔌 Player disconnected: ${socket.id}`);
        leaveLobby(socket);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🚀 SPACETIME 3D SERVER RUNNING! 🚀   ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║   Port: ${PORT}                           ║`);
    console.log('║   Waiting for pilots...                 ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
});

// Clean up empty lobbies every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
        // Delete lobbies older than 1 hour with no players
        if (lobby.players.length === 0 && now - lobby.createdAt > 3600000) {
            lobbies.delete(code);
            console.log(`🗑️ Cleaned up old lobby: ${code}`);
        }
    }
}, 300000);
