// ==================== ゲーム設定 ===================
const COLS = 12; 
const ROWS = 24; 
const BLOCK_SIZE = 30; 
const NEXT_COUNT = 5; 

const canvas = document.getElementById('tetris-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
// 🌟 REN表示用の要素（後でHTMLに追加するか、動的に制御します）
let renElement = document.getElementById('ren-display');

const holdCanvas = document.getElementById('hold-piece-canvas');
const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;

const nextCanvases = Array.from(document.querySelectorAll('.next-canvas'));
const nextContexts = nextCanvases.map(c => c.getContext('2d'));
const NEXT_CANVAS_SIZE = 90; 

if (canvas) {
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
}
if (holdCanvas) {
    holdCanvas.width = 180;
    holdCanvas.height = 180;
}
nextCanvases.forEach(c => {
    c.width = NEXT_CANVAS_SIZE;
    c.height = NEXT_CANVAS_SIZE;
});

// ゲーム変数
let score = 0;
let level = 1;
let linesClearedTotal = 0;
let renCount = -1; // 🌟 REN用
let board = [];

let currentPiece = null;
let nextQueue = []; 
let holdPiece = null;
let canHold = true; 

let gameLoop = null;
let defaultDropInterval = 800; 
let currentDropInterval = defaultDropInterval;
const SOFT_DROP_MULTIPLIER = 10; 
let currentRotation = 0; 

// ==================== ペントミノ定義 (18種) ====================
const PIECES = [
    { shape: [[0,1,1],[1,1,0],[0,1,0]], color: '#FF5733' }, // F
    { shape: [[1,1,0],[0,1,1],[0,1,0]], color: '#FF8D6A' }, // F'
    { shape: [[1],[1],[1],[1],[1]], color: '#00BFFF' },    // I
    { shape: [[1,0],[1,0],[1,0],[1,1]], color: '#1E90FF' }, // L
    { shape: [[0,1],[0,1],[0,1],[1,1]], color: '#4682B4' }, // L'
    { shape: [[1,1],[1,1],[1,0]], color: '#FFD700' },       // P
    { shape: [[1,1],[1,1],[0,1]], color: '#FFA500' },       // P'
    { shape: [[0,1],[1,1],[1,0],[1,0]], color: '#9932CC' }, // N
    { shape: [[1,0],[1,1],[0,1],[0,1]], color: '#BA55D3' }, // N'
    { 
        shape: [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 1, 1, 1, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0]
        ], 
        color: '#800080' 
    }, // T (5x5)
    { shape: [[1,0,1],[1,1,1],[0,0,0]], color: '#3CB371' }, // U
    { shape: [[1,0,0],[1,0,0],[1,1,1]], color: '#4169E1' }, // V
    { shape: [[1,0,0],[1,1,0],[0,1,1]], color: '#DA70D6' }, // W
    { shape: [[0,1,0],[1,1,1],[0,1,0]], color: '#DC143C' }, // X
    { shape: [[0,1],[1,1],[0,1],[0,1]], color: '#20B2AA' }, // Y
    { shape: [[1,0],[1,1],[1,0],[1,0]], color: '#008080' }, // Y'
    { shape: [[1,1,0],[0,1,0],[0,1,1]], color: '#B22222' }, // Z
    { shape: [[0,1,1],[0,1,0],[1,1,0]], color: '#CD5C5C' }, // Z'
];

const KICK_TABLE = [
    [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2], [+1, 0], [+2, 0], [0, +1], [0, -1]], 
    [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2], [-1, 0], [-2, 0], [0, +1], [0, -1]],
    [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2], [-1, 0], [-2, 0], [0, +1], [0, -1]], 
    [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2], [+1, 0], [+2, 0], [0, +1], [0, -1]],
    [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2], [-1, 0], [-2, 0], [0, +1], [0, -1]], 
    [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2], [+1, 0], [+2, 0], [0, +1], [0, -1]],
    [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2], [+1, 0], [+2, 0], [0, +1], [0, -1]], 
    [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2], [-1, 0], [-2, 0], [0, +1], [0, -1]]
];

// ==================== ユーティリティ ====================
function rotateMatrix(matrix) {
    return matrix[0].map((_, c) => matrix.map(r => r[c]).reverse());
}
function rotateMatrixCCW(matrix) {
    const M = matrix.length;
    const N = matrix[0].length;
    const result = Array.from({length: N}, () => new Array(M));
    for(let i=0; i<M; i++){
        for(let j=0; j<N; j++){
            result[N-1-j][i] = matrix[i][j];
        }
    }
    return result;
}

function getPieceSize(shape) {
    const height = shape.length;
    let width = 0;
    for (const row of shape) { width = Math.max(width, row.length); }
    return { width, height };
}

function getNewRotatedPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const piece = PIECES[index];
    return { shape: piece.shape.map(row => [...row]), color: piece.color };
}

function getDropY() {
    if (!currentPiece) return -1;
    let y = currentPiece.y;
    while (!checkCollision(0, 1, currentPiece.shape, currentPiece.x, y)) { y++; }
    return y;
}

// 🌟 全消し判定
function isAllClear() {
    return board.every(row => row.every(cell => cell === 0));
}

// ==================== 描画関数 ====================
function renderScore() {
    if (scoreElement) {
        scoreElement.innerText = `${score} (Lv.${level})`;
    }
    // 🌟 REN表示の更新
    if (renElement) {
        if (renCount > 0) {
            renElement.innerText = `${renCount} REN!`;
            renElement.style.opacity = "1";
        } else {
            renElement.style.opacity = "0";
        }
    }
}

function drawBlock(x, y, color, context, size) {
    if (color) {
        context.fillStyle = color;
        context.fillRect(x * size, y * size, size, size);
        context.strokeStyle = 'rgba(0,0,0,0.3)';
        context.lineWidth = 1;
        context.strokeRect(x * size, y * size, size, size);
        context.fillStyle = 'rgba(255,255,255,0.2)';
        context.fillRect(x * size, y * size, size, 4);
        context.fillRect(x * size, y * size, 4, size);
    }
}

function drawGhostPiece() {
    if (!ctx || !currentPiece) return;
    const dropY = getDropY();
    const shape = currentPiece.shape;
    ctx.globalAlpha = 0.2; 
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c] && dropY + r >= 0) { 
                drawBlock(currentPiece.x + c, dropY + r, currentPiece.color, ctx, BLOCK_SIZE);
            }
        }
    }
    ctx.globalAlpha = 1.0; 
}

function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * BLOCK_SIZE, 0); ctx.lineTo(x * BLOCK_SIZE, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * BLOCK_SIZE); ctx.lineTo(canvas.width, y * BLOCK_SIZE); ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r] && board[r][c]) drawBlock(c, r, board[r][c], ctx, BLOCK_SIZE);
        }
    }
    drawGhostPiece();
    if (currentPiece) {
        const { shape, color, x, y } = currentPiece;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] && y + r >= 0) { 
                    drawBlock(x + c, y + r, color, ctx, BLOCK_SIZE);
                }
            }
        }
    } else if (gameLoop === null) {
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PRESS ENTER TO START", canvas.width / 2, canvas.height / 2);
    }
}

function drawCenteredPiece(piece, context, canvasWidth, canvasHeight, overrideColor = null) {
    let shape = piece.shape;
    const color = overrideColor || piece.color;
    const { width: initW, height: initH } = getPieceSize(shape);
    const pieceIndex = PIECES.findIndex(p => p.color === piece.color && p.shape.length === piece.shape.length);
    const specialRotatedIndices = [0, 1, 7, 8, 9, 12, 14, 15, 16, 17]; 
    if (initH > initW && initH >= 3 || specialRotatedIndices.includes(pieceIndex)) {
        shape = rotateMatrix(shape);
    }
    let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                minR = Math.min(minR, r); maxR = Math.max(maxR, r);
                minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            }
        }
    }
    const realW = maxC - minC + 1;
    const realH = maxR - minR + 1;
    const maxDim = 5; 
    const blockSize = Math.floor((canvasWidth - 10) / maxDim);
    const offsetX = (canvasWidth - realW * blockSize) / 2;
    const offsetY = (canvasHeight - realH * blockSize) / 2;
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (shape[r][c]) {
                drawBlock((offsetX / blockSize) + (c - minC), (offsetY / blockSize) + (r - minR), color, context, blockSize);
            }
        }
    }
}

function drawNextQueue() {
    nextContexts.forEach((nCtx, i) => {
        const nCanvas = nextCanvases[i];
        if (!nCanvas) return;
        nCtx.clearRect(0, 0, nCanvas.width, nCanvas.height);
        if (nextQueue[i]) { drawCenteredPiece(nextQueue[i], nCtx, nCanvas.width, nCanvas.height); }
    });
}

function drawHoldPiece() {
    if (!holdCtx || !holdCanvas) return;
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (holdPiece) {
        const drawColor = canHold ? holdPiece.color : '#888888';
        drawCenteredPiece(holdPiece, holdCtx, holdCanvas.width, holdCanvas.height, drawColor);
    }
}

// ==================== ゲームロジック ====================
function checkCollision(dx, dy, newShape = currentPiece.shape, currentX = currentPiece.x, currentY = currentPiece.y) {
    for (let r = 0; r < newShape.length; r++) {
        for (let c = 0; c < newShape[r].length; c++) {
            if (newShape[r][c]) {
                const newX = currentX + dx + c;
                const newY = currentY + dy + r;
                if (newX < 0 || newX >= COLS || newY >= ROWS) return true; 
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function fillNextQueue() {
    while (nextQueue.length < NEXT_COUNT) { nextQueue.push(getNewRotatedPiece()); }
}

function spawnPiece() {
    if (nextQueue.length === 0) fillNextQueue();
    const next = nextQueue.shift();
    fillNextQueue();
    currentPiece = {
        shape: next.shape, color: next.color,
        x: Math.floor(COLS / 2) - Math.floor(next.shape[0].length / 2),
        y: (next.shape.length === 5) ? -3 : -2 
    };
    currentRotation = 0; 
    const { width, height } = getPieceSize(currentPiece.shape);
    const pieceIndex = PIECES.findIndex(p => p.color === currentPiece.color && p.shape.length === currentPiece.shape.length);
    const specialRotatedIndices = [0, 1, 7, 8, 9, 12, 14, 15, 16, 17]; 
    if (height > width && height >= 3 || specialRotatedIndices.includes(pieceIndex)) {
         currentPiece.shape = rotateMatrix(currentPiece.shape);
         currentRotation = 1;
         currentPiece.x = Math.floor(COLS / 2) - Math.floor(currentPiece.shape[0].length / 2);
    }
    drawNextQueue(); 
    if (checkCollision(0, 0)) { gameOver(); return false; }
    return true;
}

function holdCurrentPiece() {
    if (!canHold || !currentPiece) return false;
    const pieceForHold = { shape: currentPiece.shape.map(row => [...row]), color: currentPiece.color };
    if (holdPiece === null) {
        holdPiece = pieceForHold;
        spawnPiece(); 
    } else {
        const swap = holdPiece;
        holdPiece = pieceForHold;
        currentPiece = {
            shape: swap.shape, color: swap.color,
            x: Math.floor(COLS / 2) - Math.floor(swap.shape[0].length / 2),
            y: (swap.shape.length === 5) ? -3 : -2 
        };
        currentRotation = 0;
        if (checkCollision(0, 0)) { gameOver(); return false; }
    }
    canHold = false; 
    drawHoldPiece();
    return true;
}

function solidifyPiece() {
    const { shape, color, x, y } = currentPiece;
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c] && y + r >= 0) { board[y + r][x + c] = color; }
        }
    }
    checkLines();
    canHold = true; 
    drawHoldPiece();
    spawnPiece();
}

function checkLines() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== 0)) {
            board.splice(r, 1);
            board.unshift(Array(COLS).fill(0));
            linesCleared++; r++; 
        }
    }
    // 🌟 RENと全消しの判定
    if (linesCleared > 0) {
        renCount++;
        const allClearBonus = isAllClear();
        updateScore(linesCleared, renCount, allClearBonus);
    } else {
        renCount = -1; // 途切れたら-1に戻す
        renderScore(); // REN表示を消すため
    }
}

function updateScore(lines, ren, allClear) {
    // 🌟 ペントミノ版スコア配分
    const basePoints = [0, 100, 300, 700, 1500, 5000]; 
    let points = (basePoints[lines] || 100) * level;

    // 🌟 RENボーナス (50定数)
    if (ren > 0) {
        points += (50 * ren * level);
    }

    // 🌟 全消しボーナス (3000定数)
    if (allClear) {
        points += (3000 * level);
    }

    score += points;
    linesClearedTotal += lines;
    if (Math.floor(linesClearedTotal / 10) >= level) {
        level++;
        defaultDropInterval = Math.max(100, defaultDropInterval * 0.9); 
    }
    renderScore();
}

function pieceMove(dx, dy) {
    if (checkCollision(dx, dy)) { 
        if (dy === 1) solidifyPiece(); 
        return false;
    }
    currentPiece.x += dx;
    currentPiece.y += dy;
    return true;
}

function pieceRotate(direction = 1) {
    if (!currentPiece) return false;
    const originalShape = currentPiece.shape;
    let newShape = direction === 1 ? rotateMatrix(originalShape) : rotateMatrixCCW(originalShape);
    const { width: oldW, height: oldH } = getPieceSize(originalShape);
    const { width: newW, height: newH } = getPieceSize(newShape);
    let isCellCenter = (oldW === 5 || oldH === 5 || oldW === 3 || oldH === 3);
    let cOldX = isCellCenter ? Math.floor(oldW / 2) : (oldW - 1) / 2;
    let cOldY = isCellCenter ? Math.floor(oldH / 2) : (oldH - 1) / 2;
    let cNewX = isCellCenter ? Math.floor(newW / 2) : (newW - 1) / 2;
    let cNewY = isCellCenter ? Math.floor(newH / 2) : (newH - 1) / 2;
    const dxAdjust = Math.round(cOldX - cNewX);
    const dyAdjust = Math.round(cOldY - cNewY);
    const oldState = currentRotation;
    const newState = (currentRotation + direction + 4) % 4;
    let kickIndex = direction === 1 ? oldState * 2 : newState * 2 + 1;
    const tests = KICK_TABLE[kickIndex]; 
    for (let i = 0; i < tests.length; i++) {
        const [dxKick, dyKick] = tests[i];
        const dx = dxKick + dxAdjust;
        const dy = dyKick + dyAdjust;
        if (!checkCollision(dx, dy, newShape, currentPiece.x, currentPiece.y)) {
            currentPiece.shape = newShape; currentPiece.x += dx; currentPiece.y += dy;
            currentRotation = newState; return true;
        }
    }
    return false;
}

function hardDrop() {
    const dropY = getDropY();
    const distance = dropY - currentPiece.y;
    if (distance > 0) { score += distance * 2; renderScore(); }
    currentPiece.y = dropY;
    solidifyPiece();
    drawBoard();
}

// ==================== メイン処理 ====================
function gameOver() {
    clearInterval(gameLoop);
    gameLoop = null; 
    alert(`Game Over!\nFinal Score: ${score}\nLevel: ${level}`);
    initBoard(); 
}

function gameTick() {
    if (currentPiece) pieceMove(0, 1);
    drawBoard();
}

function resetGameLoop(interval) {
    clearInterval(gameLoop);
    gameLoop = setInterval(gameTick, interval);
}

function initBoard() {
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; level = 1; renCount = -1; linesClearedTotal = 0;
    defaultDropInterval = 800; currentDropInterval = defaultDropInterval;
    currentPiece = null; nextQueue = []; holdPiece = null; canHold = true; 
    renderScore();
    drawBoard(); drawNextQueue(); drawHoldPiece();
}

// ==================== 入力イベント ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { initBoard(); return; }
    if (currentPiece === null && e.key === 'Enter') {
        fillNextQueue();
        spawnPiece();
        resetGameLoop(defaultDropInterval);
        return;
    }
    if (!currentPiece) return;
    switch (e.key) {
        case 'ArrowLeft': pieceMove(-1, 0); break;
        case 'ArrowRight': pieceMove(1, 0); break;
        case 'ArrowDown': 
            if (currentDropInterval === defaultDropInterval) {
                currentDropInterval = defaultDropInterval / SOFT_DROP_MULTIPLIER;
                resetGameLoop(currentDropInterval);
            }
            if (pieceMove(0, 1)) { score += 1; renderScore(); }
            break;
        case 'ArrowUp': case 'x': case 'X': pieceRotate(1); break;
        case 'z': case 'Z': pieceRotate(-1); break;
        case ' ': e.preventDefault(); hardDrop(); break;
        case 'c': case 'C': holdCurrentPiece(); break;
    }
    drawBoard();
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown' && gameLoop !== null) {
        currentDropInterval = defaultDropInterval;
        resetGameLoop(currentDropInterval);
    }
});

// 🌟 動的にREN表示用のDIVを作成
if (!document.getElementById('ren-display')) {
    const renDiv = document.createElement('div');
    renDiv.id = 'ren-display';
    renDiv.style.color = '#00f0f0';
    renDiv.style.fontSize = '1.5em';
    renDiv.style.fontWeight = 'bold';
    renDiv.style.textAlign = 'center';
    renDiv.style.transition = 'opacity 0.2s';
    renDiv.style.height = '1.6em';
    const scoreStatus = document.querySelector('.score-status');
    if (scoreStatus) scoreStatus.prepend(renDiv);
    renElement = renDiv;
}

initBoard();