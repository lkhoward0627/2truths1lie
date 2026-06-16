const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// In-memory room store (ephemeral)
const rooms = new Map(); // roomId -> { hostSocketId, players: [] }

function makeRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create-room', (cb) => {
    const roomId = makeRoomId();
    rooms.set(roomId, { hostSocketId: socket.id, players: [], clients: [], started: false });
    socket.join(roomId);
    console.log('room created', roomId);
    if (typeof cb === 'function') cb({ roomId });
  });

  socket.on('join-room', ({ roomId, player }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found' });
      return;
    }

    if (room.started) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Game already started. Cannot join.' });
      return;
    }

    socket.join(roomId);
    room.clients = room.clients || [];
    if (!room.clients.includes(socket.id)) {
      room.clients.push(socket.id);
    }

    // store player server-side
    room.players.push(player);

    // notify host in the room
    io.to(roomId).emit('player-joined', { player });

    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('start-voting', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found' });
      return;
    }

    room.started = true;
    io.to(roomId).emit('voting-started');
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('current-player', ({ roomId, player }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found' });
      return;
    }

    io.to(roomId).emit('current-player', { player });
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('check-room', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found' });
      return;
    }

    if (room.started) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Game already started. Cannot join.' });
      return;
    }

    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('cast-vote', ({ roomId, playerName, statementIndex }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      console.warn('cast-vote failed: room not found', { roomId, playerName, statementIndex });
      if (typeof cb === 'function') cb({ ok: false, error: 'Room not found' });
      return;
    }

    const targetPlayer = room.players.find((p) => p.name === playerName);
    if (!targetPlayer) {
      console.warn('cast-vote failed: player not found', { roomId, playerName, statementIndex, players: room.players.map(p => p.name) });
      if (typeof cb === 'function') cb({ ok: false, error: 'Player not found' });
      return;
    }

    if (!targetPlayer.statements[statementIndex]) {
      console.warn('cast-vote failed: invalid statement index', { roomId, playerName, statementIndex });
      if (typeof cb === 'function') cb({ ok: false, error: 'Invalid statement index' });
      return;
    }

    targetPlayer.statements[statementIndex].votes = (targetPlayer.statements[statementIndex].votes || 0) + 1;
    io.to(roomId).emit('vote-received', {
      playerName,
      statementIndex,
      votes: targetPlayer.statements[statementIndex].votes
    });
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('disconnect', () => {
    // If host disconnects, optionally clear rooms hosted by that socket
    for (const [roomId, info] of rooms.entries()) {
      if (info.hostSocketId === socket.id) {
        rooms.delete(roomId);
        io.to(roomId).emit('room-closed');
        console.log('room closed', roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
