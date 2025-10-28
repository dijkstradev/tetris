const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("game-over");
const finalHighScoreEl = document.querySelector(".final-high-score");
const finalCurrentScoreEl = document.querySelector(".final-current-score");
const scoreEl = document.querySelector(".score");
const highScoreEl = document.querySelector(".high-score");
const restartBtn = document.getElementById("restart-btn");
const shareBtn = document.getElementById("share-btn");
const shareCanvas = document.getElementById("share-canvas");
const shareCtx = shareCanvas.getContext("2d");

const STORAGE_KEY = "offline-tetris-high-score";

const COLS = 10;
const ROWS = 20;
const CELL = canvas.width / COLS;
const DROP_INTERVAL_START = 900;
const DROP_INTERVAL_MIN = 120;
const DROP_ACCELERATION = 35;

const COLORS = {
  I: "#62f2ff",
  J: "#4c74ff",
  L: "#f7a54a",
  O: "#f7f45a",
  S: "#66df81",
  T: "#c47bff",
  Z: "#f76d6d",
  ghost: "rgba(255,255,255,0.18)",
  grid: "rgba(255,255,255,0.05)",
  border: "#2b2b2b",
  well: "#111111",
};

const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

const SWIPE_THRESHOLD_PX = 40;

const touchPointer = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
};

const SHAPES = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
  O: [
    [
      [1, 1],
      [1, 1],
    ],
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  ],
};

const SCORE_TABLE = {
  1: 100,
  2: 250,
  3: 500,
  4: 800,
};

let board = createBoard();
let bag = [];
let currentPiece = null;
let dropAccumulator = 0;
let dropInterval = DROP_INTERVAL_START;
let lastTime = performance.now();
let score = 0;
let lines = 0;
let highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
let state = {
  running: false,
  over: false,
  started: false,
};

function createBoard() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null)
  );
}

function resetGame() {
  board = createBoard();
  bag = [];
  currentPiece = null;
  dropAccumulator = 0;
  dropInterval = DROP_INTERVAL_START;
  score = 0;
  lines = 0;
  state = { running: false, over: false, started: false };
  touchPointer.active = false;
  touchPointer.pointerId = null;
  overlay.classList.add("overlay--hidden");
  spawnPiece();
  updateScoreboard();
}

function startGame() {
  if (state.running) return;
  state.running = true;
  state.started = true;
}

function gameOver() {
  state.running = false;
  state.over = true;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(STORAGE_KEY, highScore);
  }
  finalHighScoreEl.textContent = highScore.toString().padStart(6, "0");
  finalCurrentScoreEl.textContent = score.toString().padStart(6, "0");
  renderShareCard();
  overlay.classList.remove("overlay--hidden");
  updateScoreboard();
}

function spawnPiece() {
  if (bag.length === 0) {
    bag = shuffle(Object.keys(SHAPES));
  }
  const type = bag.pop();
  const rotations = SHAPES[type];
  currentPiece = {
    type,
    rotations,
    rotationIndex: 0,
    matrix: rotations[0],
    x: Math.floor(COLS / 2) - Math.ceil(rotations[0][0].length / 2),
    y: type === "I" ? -1 : 0,
  };

  if (collides(currentPiece, 0, 0)) {
    gameOver();
  }
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function collides(piece, offsetX, offsetY, testMatrix = piece.matrix) {
  for (let y = 0; y < testMatrix.length; y += 1) {
    for (let x = 0; x < testMatrix[y].length; x += 1) {
      if (!testMatrix[y][x]) continue;
      const boardX = piece.x + x + offsetX;
      const boardY = piece.y + y + offsetY;
      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
        return true;
      }
      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece() {
  const { matrix, x, y, type } = currentPiece;
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      const boardY = y + rowIndex;
      if (boardY < 0) return;
      board[boardY][x + colIndex] = type;
    });
  });
  const cleared = clearLines();
  if (cleared > 0) {
    score += SCORE_TABLE[cleared] || cleared * 250;
    lines += cleared;
    dropInterval = Math.max(
      DROP_INTERVAL_MIN,
      dropInterval - DROP_ACCELERATION * cleared
    );
    updateScoreboard();
  }
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array.from({ length: COLS }, () => null));
      cleared += 1;
      y += 1;
    }
  }
  return cleared;
}

function rotatePiece() {
  const { rotations, rotationIndex } = currentPiece;
  const nextIndex = (rotationIndex + 1) % rotations.length;
  const nextMatrix = rotations[nextIndex];
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(currentPiece, kick, 0, nextMatrix)) {
      currentPiece.rotationIndex = nextIndex;
      currentPiece.matrix = nextMatrix;
      currentPiece.x += kick;
      return;
    }
  }
}

function movePiece(offsetX, offsetY) {
  if (!currentPiece) return false;
  if (!collides(currentPiece, offsetX, offsetY)) {
    currentPiece.x += offsetX;
    currentPiece.y += offsetY;
    return true;
  }
  if (offsetY > 0) {
    mergePiece();
  }
  return false;
}

function hardDrop() {
  let distance = 0;
  while (movePiece(0, 1)) {
    distance += 1;
  }
  score += Math.max(2, distance * 2);
  updateScoreboard();
}

function updateScoreboard() {
  scoreEl.textContent = score.toString().padStart(6, "0");
  highScoreEl.textContent = highScore.toString().padStart(6, "0");
}

function draw() {
  ctx.fillStyle = COLORS.well;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawBoard();
  drawGhostPiece();
  drawCurrentPiece();

  if (!state.started) {
    drawStartPrompt();
  }
}

function drawGrid() {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }
}

function drawBoard() {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const type = board[y][x];
      if (!type) continue;
      drawCell(x, y, COLORS[type]);
    }
  }
}

function drawCurrentPiece() {
  if (!currentPiece) return;
  const { matrix, x, y, type } = currentPiece;
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      const drawX = x + colIndex;
      const drawY = y + rowIndex;
      if (drawY < 0) return;
      drawCell(drawX, drawY, COLORS[type]);
    });
  });
}

function drawGhostPiece() {
  if (!currentPiece) return;
  const ghost = {
    ...currentPiece,
    y: currentPiece.y,
  };
  while (!collides(ghost, 0, 1)) {
    ghost.y += 1;
  }
  ghost.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      const drawX = ghost.x + colIndex;
      const drawY = ghost.y + rowIndex;
      if (drawY < 0) return;
      drawCell(drawX, drawY, COLORS.ghost, true);
    });
  });
}

function drawCell(gridX, gridY, color, ghost = false) {
  const x = gridX * CELL;
  const y = gridY * CELL;
  const inset = ghost ? 0 : 1;
  ctx.fillStyle = color;
  ctx.fillRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);
  if (!ghost) {
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(
      x + inset,
      y + inset + (CELL - inset * 2) - 6,
      CELL - inset * 2,
      6
    );
  }
}

function isTouchLayout() {
  return (
    coarsePointerQuery.matches ||
    window.matchMedia("(max-width: 520px)").matches
  );
}

function drawStartPrompt() {
  const message = isTouchLayout() ? "Tap to start" : "Press ↑ to start";

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(20, canvas.height / 2 - 70, canvas.width - 40, 140);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.strokeRect(20, canvas.height / 2 - 70, canvas.width - 40, 140);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "22px 'Press Start 2P', monospace";
  ctx.fillText("TETRIS", canvas.width / 2, canvas.height / 2 - 14);
  ctx.font = "12px 'Press Start 2P', monospace";
  ctx.fillStyle = "#cccccc";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 28);
}

function update(now) {
  const delta = now - lastTime;
  lastTime = now;

  if (!state.running) {
    draw();
    requestAnimationFrame(update);
    return;
  }

  dropAccumulator += delta;
  if (dropAccumulator >= dropInterval) {
    if (!movePiece(0, 1)) {
      if (state.over) {
        requestAnimationFrame(update);
        return;
      }
    }
    dropAccumulator = 0;
  }

  draw();
  requestAnimationFrame(update);
}

function handleKeyDown(event) {
  if (state.over && event.key === "Enter") {
    resetGame();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!state.started) startGame();
    if (state.over) return;
    rotatePiece();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (!state.started) startGame();
    if (state.over) return;
    movePiece(-1, 0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    if (!state.started) startGame();
    if (state.over) return;
    movePiece(1, 0);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!state.started) startGame();
    if (state.over) return;
    movePiece(0, 1);
    score += 5;
    updateScoreboard();
  } else if (event.key === " ") {
    event.preventDefault();
    if (!state.started) startGame();
    if (state.over) return;
    hardDrop();
  }
}

function handlePointerDown(event) {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
  touchPointer.active = true;
  touchPointer.pointerId = event.pointerId;
  touchPointer.startX = event.clientX;
  touchPointer.startY = event.clientY;
  event.preventDefault();
}

function handlePointerUp(event) {
  if (!touchPointer.active || event.pointerId !== touchPointer.pointerId) return;
  event.preventDefault();
  touchPointer.active = false;

  if (state.over) return;

  const deltaX = event.clientX - touchPointer.startX;
  const deltaY = event.clientY - touchPointer.startY;
  const rect = canvas.getBoundingClientRect();

  if (deltaY > SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
    if (!state.started) startGame();
    if (!state.over) {
      hardDrop();
    }
    return;
  }

  handleTouchTap(event.clientX, event.clientY, rect);
}

function handlePointerCancel(event) {
  if (event.pointerId === touchPointer.pointerId) {
    touchPointer.active = false;
  }
}

function handleTouchTap(clientX, clientY, rect) {
  if (state.over) return;
  if (!state.started) startGame();
  if (!currentPiece) return;

  const { col, row } = getGridPosition(clientX, clientY, rect);
  const piece = currentPiece;
  const pieceWidth = piece.matrix[0].length;
  const pieceHeight = piece.matrix.length;
  const pieceLeft = piece.x;
  const pieceRight = pieceLeft + pieceWidth - 1;
  const pieceTop = Math.max(piece.y, 0);
  const pieceBottom = pieceTop + pieceHeight - 1;
  const withinPieceWidth = col >= pieceLeft && col <= pieceRight;

  if ((row < pieceTop || row > pieceBottom) && withinPieceWidth) {
    rotatePiece();
    return;
  }

  if (col < pieceLeft) {
    movePiece(-1, 0);
    return;
  }

  if (col > pieceRight) {
    movePiece(1, 0);
    return;
  }

  if (withinPieceWidth) {
    rotatePiece();
  }
}

function getGridPosition(clientX, clientY, rect = canvas.getBoundingClientRect()) {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  const col = Math.floor(relX * COLS);
  const row = Math.floor(relY * ROWS);
  return { col, row };
}

function renderShareCard() {
  const width = shareCanvas.width;
  const height = shareCanvas.height;
  shareCtx.fillStyle = "#121212";
  shareCtx.fillRect(0, 0, width, height);

  const gradient = shareCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(60,60,60,0.25)");
  gradient.addColorStop(1, "rgba(18,18,18,0.8)");
  shareCtx.fillStyle = gradient;
  shareCtx.fillRect(14, 14, width - 28, height - 28);

  shareCtx.strokeStyle = "#2d2d2d";
  shareCtx.lineWidth = 4;
  shareCtx.strokeRect(14, 14, width - 28, height - 28);

  shareCtx.fillStyle = "#f2f2f2";
  shareCtx.font = "28px 'Press Start 2P', monospace";
  shareCtx.textAlign = "center";
  shareCtx.fillText("TETRIS", width / 2, 90);

  shareCtx.font = "18px 'Press Start 2P', monospace";
  shareCtx.fillStyle = "#9d9d9d";
  shareCtx.fillText(`Score ${score.toString().padStart(6, "0")}`, width / 2, 160);
  shareCtx.fillText(`Best  ${highScore.toString().padStart(6, "0")}`, width / 2, 200);

  shareCtx.font = "12px 'Press Start 2P', monospace";
  shareCtx.fillStyle = "#666666";
  shareCtx.fillText("#OfflineTetris", width / 2, height - 48);
  shareCtx.fillText("chrome vibes • offline stacks", width / 2, height - 28);
}

function downloadShareImage() {
  const dataUrl = shareCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `offline-tetris-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function init() {
  updateScoreboard();
  resetGame();
  requestAnimationFrame((time) => {
    lastTime = time;
    update(time);
  });
}

document.addEventListener("keydown", handleKeyDown, { passive: false });
canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
canvas.addEventListener("pointerup", handlePointerUp, { passive: false });
canvas.addEventListener("pointercancel", handlePointerCancel, { passive: false });
restartBtn.addEventListener("click", resetGame);
shareBtn.addEventListener("click", downloadShareImage);

init();
