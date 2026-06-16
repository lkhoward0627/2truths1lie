// Players will be populated from the setup form
const players = [];

let isPlaying = false;
let playedCount = 0;
let allPlayersSnapshot = null; // preserve full list for spinner

// DOM Elements
const topicTitle = document.getElementById('topic-title');
const cardsContainer = document.getElementById('cards-container');
const nextBtn = document.getElementById('next-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const qrContainer = document.getElementById('qr-container');

// Socket.IO
let socket;
let currentRoomId = null;
const joinedMobilePlayerNames = new Set();

// Setup form elements
const playerNameInput = document.getElementById('player-name-input');
const stmt1 = document.getElementById('stmt1');
const stmt2 = document.getElementById('stmt2');
const stmt3 = document.getElementById('stmt3');
const addPlayerBtn = document.getElementById('add-player-btn');
const sampleDataBtn = document.getElementById('sample-data-btn');
const startVotingBtn = document.getElementById('start-voting-btn');
const resetBtn = document.getElementById('reset-btn');
const queuedRounds = document.getElementById('queued-rounds');
const setupDiv = document.querySelector('.setup');
const votingArea = document.getElementById('voting-area');
const votingPlayerName = document.getElementById('voting-player-name');
const votingCards = document.getElementById('voting-cards');
const roundResults = document.getElementById('round-results');
const resultsArea = document.getElementById('results-area');
const selectedPlayersDiv = document.getElementById('selected-players');
let currentRoundPlayer = null;

// Utility function to shuffle array elements
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function loadVotingForPlayer(player) {
  // Reset UI
  votingCards.innerHTML = '';
  nextBtn.classList.remove('hidden');
  nextBtn.dataset.state = 'reveal';
  nextBtn.textContent = 'Reveal';
  nextBtn.disabled = false;

  votingPlayerName.textContent = player.name;
  currentRoundPlayer = player;

  // Prepare shuffled view mapping to original indexes
  const indexed = player.statements.map((s, i) => ({ ...s, origIndex: i }));
  const shuffled = shuffleArray(indexed);

  shuffled.forEach((statement) => {
    const card = document.createElement('div');
    card.classList.add('card', 'read-only');
    card.dataset.originalIndex = statement.origIndex;
    card.innerHTML = `
      <div class="text">${statement.text}</div>
      <div class="vote-row">
        <span class="vote-label">Votes: <strong class="vote-num">${statement.votes || 0}</strong></span>
        <div class="vote-bar"><div class="vote-fill" style="width: ${statement.votes ? Math.min(statement.votes * 20, 100) : 0}%"></div></div>
      </div>
    `;

    card.style.pointerEvents = 'none';
    votingCards.appendChild(card);
  });
}

function revealPlayerAnswers(player, displayedList) {
  const allCards = votingCards.querySelectorAll('.card');
  allCards.forEach((card, i) => {
    card.classList.add('revealed');
    const stmt = displayedList[i];
    if (stmt.isLie) {
      card.classList.add('lie');
    } else {
      card.classList.add('truth');
    }

    const voteNum = card.querySelector('.vote-num');
    if (voteNum) voteNum.textContent = player.statements[stmt.origIndex].votes || 0;
  });

  appendRoundSummary(player);
  nextBtn.classList.remove('hidden');
}

function broadcastCurrentPlayer(player) {
  if (!socket || !currentRoomId) return;
  socket.emit('current-player', { roomId: currentRoomId, player }, (res) => {
    if (!res || !res.ok) {
      console.error('Failed to broadcast current player', res && res.error);
    }
  });
}

function appendRoundSummary(player) {
  if (!roundResults) return;
  roundResults.classList.remove('hidden');
  const entry = document.createElement('div');
  entry.className = 'player-results';
  entry.innerHTML = `
    <h3>Round: ${player.name}</h3>
    ${player.statements.map((s) => `
      <div>
        <strong>${s.votes || 0} votes</strong> - ${s.text} ${s.isLie ? '<em>(Lie)</em>' : ''}
      </div>
    `).join('')}
  `;
  roundResults.appendChild(entry);
}

function pickNextPlayer() {
  const unplayed = players.filter(p => !p.played);
  if (unplayed.length === 0) {
    showResults();
    return;
  }

    const names = (allPlayersSnapshot && allPlayersSnapshot.length) ? allPlayersSnapshot.map(p => p.name) : unplayed.map(p => p.name);
  const chosenName = unplayed[Math.floor(Math.random() * unplayed.length)].name;
  // animate selection like a word-cloud spinner
  nextBtn.disabled = true;
  animateNameSelection(names, chosenName, (finalName) => {
    const player = unplayed.find(p => p.name === finalName) || unplayed[0];
    player.played = true;
    playedCount++;

    // show voting area and load player's statements
    votingArea.classList.remove('hidden');
    resultsArea.classList.add('hidden');
    loadVotingForPlayer(player);
    broadcastCurrentPlayer(player);
  });
}

function animateNameSelection(names, chosenName, onSelected) {
  const spinner = document.getElementById('name-spinner');
  if (!spinner || !names || names.length === 0) {
    const finalName = names && names.length ? names[Math.floor(Math.random() * names.length)] : null;
    onSelected(finalName);
    return;
  }

  const finalName = chosenName || names[Math.floor(Math.random() * names.length)];
  spinner.innerHTML = '';
  // hide underlying game container to present a clean spinner screen
  const gameContainer = document.querySelector('.game-container');
  if (gameContainer) gameContainer.style.visibility = 'hidden';
  spinner.classList.remove('hidden');

  const cloud = document.createElement('div');
  cloud.className = 'name-cloud';
  spinner.appendChild(cloud);

  const chips = [];
  names.forEach((nm, i) => {
    const c = document.createElement('div');
    c.className = 'name-chip floating';
    c.textContent = nm;
    // random position inside cloud (avoid edges)
    const left = 5 + Math.random() * 90;
    const top = 5 + Math.random() * 90;
    c.style.left = left + '%';
    c.style.top = top + '%';
    c.style.animationDuration = (3 + Math.random() * 3) + 's';
    cloud.appendChild(c);
    chips.push(c);
  });

  const runMs = 2000 + Math.floor(Math.random() * 1200);
  const finalIndex = names.indexOf(finalName);
  const targetIndex = finalIndex >= 0 ? finalIndex : Math.floor(Math.random() * names.length);

  // after runMs, fade others and highlight chosen
  setTimeout(() => {
    chips.forEach((c, idx) => {
      if (idx === targetIndex) {
        c.classList.add('chosen');
        c.classList.remove('faded');
      } else {
        c.classList.add('faded');
      }
    });

    setTimeout(() => {
      spinner.classList.add('hidden');
      if (gameContainer) gameContainer.style.visibility = '';
      onSelected(names[targetIndex]);
    }, 900);
  }, runMs);
}

function addPlayerFromForm() {
  const name = playerNameInput.value.trim();
  const s1 = stmt1.value.trim();
  const s2 = stmt2.value.trim();
  const s3 = stmt3.value.trim();
  const lieRadio = document.querySelector('input[name="lie"]:checked');

  if (!name || !s1 || !s2 || !s3) {
    alert('Please provide player name and all three statements.');
    return;
  }

  const lieIndex = lieRadio ? Number(lieRadio.value) : 0;

  const statements = [s1, s2, s3].map((t, i) => ({ text: t, isLie: i === lieIndex, votes: 0 }));

  players.push({ name, statements, played: false });
  updateQueuedList();

  // Clear statements for convenience
  playerNameInput.value = '';
  stmt1.value = '';
  stmt2.value = '';
  stmt3.value = '';
}

function generateSampleData() {
  players.length = 0;
  const sampleNames = [
    'Alice', 'Bob', 'Cara', 'David', 'Eva',
    'Frank', 'Gina', 'Henry', 'Ivy', 'Jack'
  ];

  const sampleStatements = [
    [
      'I have skydived in New Zealand',
      'I hate pizza',
      'I once met a movie star'
    ],
    [
      'I can play the ukulele',
      'I never learned to swim',
      'I have been on TV'
    ],
    [
      'I speak three languages',
      'I have a pet snake',
      'I love sushi'
    ],
    [
      'I ran a marathon',
      'I am allergic to chocolate',
      'I have climbed a volcano'
    ],
    [
      'I can juggle',
      'I used to work in a bakery',
      'I hate coffee'
    ],
    [
      'I grew up on a farm',
      'I have never flown in a plane',
      'I once competed in a dance show'
    ],
    [
      'I am a twin',
      'I collect vintage records',
      'I have travelled to Japan'
    ],
    [
      'I love spicy food',
      'I once rescued a cat from a tree',
      'I have a black belt in karate'
    ],
    [
      'I can bake macarons',
      'I have ridden a camel',
      'I hate roller coasters'
    ],
    [
      'I have been scuba diving',
      'I once painted a mural',
      'I cannot ride a bike'
    ]
  ];

  // set one lie per player in a rotating pattern
  const samplePlayers = sampleNames.map((name, index) => {
    const lieIndex = index % 3;
    const statements = sampleStatements[index].map((text, i) => ({
      text,
      isLie: i === lieIndex,
      votes: 0
    }));

    return { name, statements, played: false };
  });

  if (socket && socket.connected && currentRoomId) {
    // register sample players in the room so server vote logic can resolve them
    joinedMobilePlayerNames.clear();
    players.length = 0;
    samplePlayers.forEach((player) => {
      socket.emit('join-room', { roomId: currentRoomId, player }, (res) => {
        if (!res || !res.ok) {
          console.warn('Failed to register sample player in room', player.name, res && res.error);
        }
      });
    });
  } else {
    players.push(...samplePlayers);
    updateQueuedList();
  }

  if (selectedPlayersDiv) {
    selectedPlayersDiv.classList.add('hidden');
  }
}

// Socket helpers: create room and listen for joined players
function initSocket() {
  if (socket) return;

  try {
    socket = io();
  } catch (err) {
    console.error('Failed to initialize socket.io client', err);
    alert('Socket initialization failed. Is the server running?');
    return;
  }

  socket.pendingRoomCreate = null;

  socket.on('connect', () => {
    console.log('connected to server', socket.id);
    if (socket.pendingRoomCreate) {
      const fn = socket.pendingRoomCreate;
      socket.pendingRoomCreate = null;
      fn();
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connect_error', err);
    alert('Unable to connect to the Socket.IO server. Start the server (npm start) and reload.');
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = 'Create Room (QR)';
  });

  socket.on('player-joined', ({ player }) => {
    // add player from mobile join
    players.push({ name: player.name, statements: player.statements, played: false });
    joinedMobilePlayerNames.add(player.name);
    updateQueuedList();
  });

  socket.on('vote-received', ({ playerName, statementIndex, votes }) => {
    if (votingPlayerName.textContent !== playerName) return;

    // update the numeric label first
    const voteLabel = votingCards.querySelector(`.card[data-original-index="${statementIndex}"] .vote-num`);
    if (voteLabel) voteLabel.textContent = votes;

    // determine max votes across current displayed items
    const allCounts = Array.from(votingCards.querySelectorAll('.vote-num')).map(el => Number(el.textContent) || 0);
    const maxVotes = Math.max(...allCounts, 1);

    // update bar fills proportionally
    votingCards.querySelectorAll('.card').forEach((cardItem) => {
      const label = cardItem.querySelector('.vote-num');
      const fill = cardItem.querySelector('.vote-fill');
      const count = Number(label.textContent) || 0;
      if (fill) fill.style.width = `${Math.min((count / maxVotes) * 100, 100)}%`;
    });

    // update host data model
    const hostPlayer = players.find((p) => p.name === playerName);
    if (hostPlayer && hostPlayer.statements[statementIndex]) {
      hostPlayer.statements[statementIndex].votes = votes;
    }

    document.getElementById('voting-instructions').textContent = 'Live votes updated. Click Reveal to show answers.';
    nextBtn.dataset.state = 'reveal';
    nextBtn.textContent = 'Reveal';
    nextBtn.classList.remove('hidden');
    nextBtn.disabled = false;
  });

  socket.on('room-closed', () => {
    alert('Host disconnected, room closed.');
    resetGame();
  });
}

function createRoom() {
  initSocket();
  if (!socket) {
    return;
  }

  function emitCreateRoom() {
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = 'Creating...';

    socket.emit('create-room', (res) => {
      if (!res || !res.roomId) {
        alert('Failed to create room');
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = 'Create Room (QR)';
        return;
      }

      currentRoomId = res.roomId;
      // generate join URL — allow overriding origin with a public URL (ngrok)
      const publicInput = document.getElementById('public-url');
      const base = publicInput && publicInput.value.trim() ? publicInput.value.trim().replace(/\/$/, '') : window.location.origin;
      const joinUrl = `${base}/join.html?room=${currentRoomId}`;

      // render QR
      qrContainer.innerHTML = '';
      // eslint-disable-next-line no-undef
      new QRCode(qrContainer, { text: joinUrl, width: 120, height: 120 });

      const info = document.createElement('div');
      info.textContent = `Room: ${currentRoomId}`;
      info.style.marginLeft = '10px';
      qrContainer.appendChild(info);
      createRoomBtn.textContent = 'Room Created';
      createRoomBtn.disabled = true;
    });
  }

  if (socket.connected) {
    emitCreateRoom();
  } else {
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = 'Connecting...';
    socket.pendingRoomCreate = emitCreateRoom;
  }
}

function updateQueuedList() {
  if (!queuedRounds) return;
  queuedRounds.innerHTML = '';
  players.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'round-item';
    div.textContent = `${idx + 1}. ${p.name}`;
    queuedRounds.appendChild(div);
  });
}

function startVoting() {
  // preserve full player list for animations (so spinner can show all names)
  allPlayersSnapshot = players.slice();

  if (players.length === 0) {
    alert('Add at least one player to start voting.');
    return;
  }

  if (!socket || !socket.connected) {
    alert('Connect to the server and create a room before starting voting.');
    return;
  }

  if (currentRoomId && joinedMobilePlayerNames.size === 0) {
    alert('No players have joined the room yet. Have players scan the QR and submit before starting voting.');
    return;
  }

  if (players.length > 5) {
    const selected = shuffleArray(players.slice()).slice(0, 5);
    players.splice(0, players.length, ...selected);
    updateQueuedList();
    topicTitle.textContent = 'Voting Time! (5 random players selected)';
  } else {
    topicTitle.textContent = 'Voting Time!';
  }

  // show which players were selected for this session
  if (selectedPlayersDiv) {
    selectedPlayersDiv.innerHTML = '';
    players.forEach((p) => {
      const pill = document.createElement('div');
      pill.className = 'player-pill';
      pill.textContent = p.name;
      selectedPlayersDiv.appendChild(pill);
    });
    selectedPlayersDiv.classList.remove('hidden');
  }

  isPlaying = true;
  setupDiv.classList.add('hidden');
  playedCount = 0;
  players.forEach(p => p.played = false);
  if (roundResults) {
    roundResults.innerHTML = '';
    roundResults.classList.remove('hidden');
  }

  socket.emit('start-voting', { roomId: currentRoomId }, (res) => {
    if (!res || !res.ok) {
      console.error('Failed to notify mobiles about voting start', res && res.error);
    }
  });

  pickNextPlayer();
}

function showResults() {
  isPlaying = false;
  votingArea.classList.add('hidden');
  resultsArea.classList.remove('hidden');
  resultsArea.innerHTML = '<h2>Final Results</h2>';

  players.forEach((p) => {
    const pr = document.createElement('div');
    pr.className = 'player-results';
    const title = document.createElement('h3');
    title.textContent = p.name;
    pr.appendChild(title);

    p.statements.forEach((s) => {
      const sdiv = document.createElement('div');
      sdiv.innerHTML = `<div>${s.text}</div><div class="vote-count">Votes: ${s.votes || 0} ${s.isLie ? '<strong>(Lie)</strong>' : ''}</div>`;
      pr.appendChild(sdiv);
    });

    resultsArea.appendChild(pr);
  });

  topicTitle.textContent = 'All Rounds Completed';
}

function resetGame() {
  players.length = 0;
  joinedMobilePlayerNames.clear();
  isPlaying = false;
  setupDiv.classList.remove('hidden');
  votingArea.classList.add('hidden');
  resultsArea.classList.add('hidden');
  if (roundResults) {
    roundResults.classList.add('hidden');
    roundResults.innerHTML = '';
  }
  queuedRounds.innerHTML = '';
  topicTitle.textContent = 'Welcome — add players to begin';
  votingCards.innerHTML = '';
  nextBtn.classList.add('hidden');
}

// Wire up setup buttons
if (addPlayerBtn) addPlayerBtn.addEventListener('click', addPlayerFromForm);
if (sampleDataBtn) sampleDataBtn.addEventListener('click', generateSampleData);
startVotingBtn.addEventListener('click', startVoting);
resetBtn.addEventListener('click', resetGame);
if (createRoomBtn) createRoomBtn.addEventListener('click', createRoom);

// Next player / reveal button behavior
nextBtn.addEventListener('click', () => {
  const state = nextBtn.dataset.state || 'reveal';
  if (state === 'reveal') {
    // reveal answers for current round
    if (!currentRoundPlayer) return;
    const cards = votingCards.querySelectorAll('.card');
    // compute max votes for scaling
    const counts = Array.from(cards).map(c => Number((c.querySelector('.vote-num') || { textContent: 0 }).textContent) || 0);
    const maxVotes = Math.max(...counts, 1);

    cards.forEach((card) => {
      const idx = Number(card.dataset.originalIndex);
      const stmt = currentRoundPlayer.statements[idx];
      card.classList.add('revealed');
      if (stmt && stmt.isLie) card.classList.add('lie'); else card.classList.add('truth');
      const label = card.querySelector('.vote-num');
      if (label) label.textContent = stmt ? (stmt.votes || 0) : 0;
      const fill = card.querySelector('.vote-fill');
      if (fill) fill.style.width = `${Math.min(((stmt && stmt.votes) || 0) / maxVotes * 100, 100)}%`;
    });

    appendRoundSummary(currentRoundPlayer);
    nextBtn.dataset.state = 'next';
    nextBtn.textContent = 'Next Player';
  } else {
    // proceed to next
    nextBtn.dataset.state = 'reveal';
    nextBtn.textContent = 'Reveal';
    nextBtn.classList.add('hidden');
    pickNextPlayer();
  }
});