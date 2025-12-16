// =================== ゲーム設定 ====================
const COLS = 12; // 12列
const ROWS = 24; // 24行
// 🌟 修正: ブロックサイズを1.5倍に拡大 (20 -> 30)
const BLOCK_SIZE = 30; 
// 🌟 修正: NEXT表示数を5に設定
const NEXT_COUNT = 5;

// メインキャンバス
const canvas = document.getElementById('tetris-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');

// HOLD用キャンバス
const holdCanvas = document.getElementById('hold-piece-canvas');
const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;

// 🌟 修正: NEXT用キャンバスをクラス名で複数取得
const nextCanvases = Array.from(document.querySelectorAll('.next-canvas'));
const nextContexts = nextCanvases.map(c => c.getContext('2d'));
// 🌟 修正: NEXTキャンバスサイズを1.5倍に拡大 (60 -> 90)
const NEXT_CANVAS_SIZE = 90; 

// Canvas内部解像度の設定
if (canvas) {
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
}
if (holdCanvas) {
    // 🌟 修正: HOLDキャンバス内部解像度を1.5倍に拡大 (120 -> 180)
    holdCanvas.width = 180;
    holdCanvas.height = 180;
}
// 🌟 修正: 複数のNext Canvasの解像度を設定
nextCanvases.forEach(c => {
    c.width = NEXT_CANVAS_SIZE;
    c.height = NEXT_CANVAS_SIZE;
});


// ゲーム変数
let score = 0;
let level = 1;
let linesClearedTotal = 0;
let combo = -1; 
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
    { shape: [[0,1,1],[1,1,0],[0,1,0]], color: '#FF5733' }, // F (3x3) <- INDEX 0
    { shape: [[1,1,0],[0,1,1],[0,1,0]], color: '#FF8D6A' }, // F' (3x3) <- INDEX 1
    { shape: [[1],[1],[1],[1],[1]], color: '#00BFFF' }, // I (1x5) - 5マス
    { shape: [[1,0],[1,0],[1,0],[1,1]], color: '#1E90FF' }, // L (2x4)
    { shape: [[0,1],[0,1],[0,1],[1,1]], color: '#4682B4' }, // L' (2x4)
    { shape: [[1,1],[1,1],[1,0]], color: '#FFD700' }, // P (2x3) 
    { shape: [[1,1],[1,1],[0,1]], color: '#FFA500' }, // P' (2x3) 
    { shape: [[0,1],[1,1],[1,0],[1,0]], color: '#9932CC' }, // N (2x4) <- INDEX 7
    { shape: [[1,0],[1,1],[0,1],[0,1]], color: '#BA55D3' }, // N' (2x4) <- INDEX 8
    { shape: [[1,1,1],[0,1,0],[0,1,0]], color: '#800080' }, // T (3x3) <- INDEX 9
    { shape: [[1,0,1],[1,1,1],[0,0,0]], color: '#3CB371' }, // U (3x3)
    { shape: [[1,0,0],[1,0,0],[1,1,1]], color: '#4169E1' }, // V (3x3)
    { shape: [[1,0,0],[1,1,0],[0,1,1]], color: '#DA70D6' }, // W (3x3) <- INDEX 12
    { shape: [[0,1,0],[1,1,1],[0,1,0]], color: '#DC143C' }, // X (3x3)
    { shape: [[0,1],[1,1],[0,1],[0,1]], color: '#20B2AA' }, // Y (2x4) <- INDEX 14
    { shape: [[1,0],[1,1],[1,0],[1,0]], color: '#008080' }, // Y' (2x4) <- INDEX 15
    { shape: [[1,1,0],[0,1,0],[0,1,1]], color: '#B22222' }, // Z (3x3) <- INDEX 16
    { shape: [[0,1,1],[0,1,0],[1,1,0]], color: '#CD5C5C' }, // Z' (3x3) <- INDEX 17
];

// ==================== 拡張SRSキックテーブル ===================
const KICK_TABLE = [
    // 0 -> R 
    [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2], [+1, 0], [+2, 0], [0, +1], [0, -1]], 
    // R -> 0 
    [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2], [-1, 0], [-2, 0], [0, +1], [0, -1]],
    // R -> 2 
    [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2], [-1, 0], [-2, 0], [0, +1], [0, -1]], 
    // 2 -> R 
    [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2], [+1, 0], [+2, 0], [0, +1], [0, -1]],
    // 2 -> L 
    [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2], [-1, 0], [-2, 0], [0, +1], [0, -1]], 
    // L -> 2 
    [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2], [+1, 0], [+2, 0], [0, +1], [0, -1]],
    // L -> 0 
    [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2], [+1, 0], [+2, 0], [0, +1], [0, -1]], 
    // 0 -> L 
    [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2], [-1, 0], [-2, 0], [0, +1], [0, -1]]
];

// ==================== ユーティリティ ====================
function rotateMatrix(matrix) {
    return matrix[0].map((_, c) => matrix.map(r => r[c]).reverse());
}
function rotateMatrixCCW(matrix) {
    // 正: 転置してから行順序反転
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

// ピースの実際の寸法を取得
function getPieceSize(shape) {
    const height = shape.length;
    let width = 0;
    // 実際には行列の最大幅だが、ここでは全行の最大列数を取る
    for (const row of shape) {
        width = Math.max(width, row.length);
    }
    return { width, height };
}

function getNewRotatedPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const piece = PIECES[index];
    return { 
        shape: piece.shape.map(row => [...row]), 
        color: piece.color,
    };
}

function getDropY() {
    if (!currentPiece) return -1;
    let y = currentPiece.y;
    while (!checkCollision(0, 1, currentPiece.shape, currentPiece.x, y)) {
        y++;
    }
    return y;
}

// ==================== 描画関数 ====================
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

    // グリッド
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * BLOCK_SIZE, 0); ctx.lineTo(x * BLOCK_SIZE, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * BLOCK_SIZE); ctx.lineTo(canvas.width, y * BLOCK_SIZE); ctx.stroke();
    }

    // 盤面
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) drawBlock(c, r, board[r][c], ctx, BLOCK_SIZE);
        }
    }

    drawGhostPiece();

    // 現在のピース
    if (currentPiece) {
        const { shape, color, x, y } = currentPiece;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] && y + r >= 0) { 
                    drawBlock(x + c, y + r, color, ctx, BLOCK_SIZE);
                }
            }
        }
    }
}

// 🌟 修正: 複数のCanvasにNEXTを描画
function drawNextQueue() {
    // nextContexts.length === NEXT_COUNT (5)
    nextContexts.forEach((nCtx, i) => {
        const canvas = nextCanvases[i];
        if (!canvas) return;
        
        const w = canvas.width;
        const h = canvas.height;
        nCtx.clearRect(0, 0, w, h);

        if (nextQueue[i]) {
            const piece = nextQueue[i];
            let shape = piece.shape; // デフォルト形状

            // 縦長ピースは描画時に横向きに回転させる
            const { width: initW, height: initH } = getPieceSize(shape);
            const pieceIndex = PIECES.findIndex(p => p.color === piece.color && p.shape.length === piece.shape.length);
            const specialRotatedIndices = [0, 1, 7, 8, 9, 12, 14, 15, 16, 17]; 

            const isVerticalPiece = (initH > initW && initH >= 3);
            const isSpecialRotatedPiece = specialRotatedIndices.includes(pieceIndex); 

            if (isVerticalPiece || isSpecialRotatedPiece) {
                shape = rotateMatrix(shape);
            }
            
            // 枠内に収めるためのブロックサイズ計算 (最大5x5)
            const maxDim = 5; 
            // 🌟 修正: blockSizeの計算をNEXT_CANVAS_SIZE(90)に合わせて調整
            const blockSize = Math.floor((w - 4) / maxDim); 

            const pW = shape[0].length;
            const pH = shape.length;
            
            // 中央寄せ
            const offsetX = (w - pW * blockSize) / 2;
            const offsetY = (h - pH * blockSize) / 2;

            for (let r = 0; r < pH; r++) {
                for (let c = 0; c < pW; c++) {
                    if (shape[r][c]) {
                        drawBlock(
                            offsetX/blockSize + c, 
                            offsetY/blockSize + r, 
                            piece.color, 
                            nCtx, 
                            blockSize
                        );
                    }
                }
            }
        }
    });
}

function drawHoldPiece() {
    if (!holdCtx || !holdCanvas) return;
    const w = holdCanvas.width; // 180
    const h = holdCanvas.height; // 180
    holdCtx.clearRect(0, 0, w, h);

    if (holdPiece) {
        const maxDim = 5;
        // 🌟 修正: blockSizeの計算をHOLDキャンバスサイズ(180)に合わせて調整
        const blockSize = Math.floor((w - 10) / maxDim);
        let shape = holdPiece.shape; // デフォルト形状
        
        // 縦長ピースは描画時に横向きに回転させる
        const { width: initW, height: initH } = getPieceSize(shape);
        const pieceIndex = PIECES.findIndex(p => p.color === holdPiece.color && p.shape.length === holdPiece.shape.length);
        const specialRotatedIndices = [0, 1, 7, 8, 9, 12, 14, 15, 16, 17]; 

        const isVerticalPiece = (initH > initW && initH >= 3);
        const isSpecialRotatedPiece = specialRotatedIndices.includes(pieceIndex); 

        if (isVerticalPiece || isSpecialRotatedPiece) {
            shape = rotateMatrix(shape);
        }

        const pW = shape[0].length;
        const pH = shape.length;
        
        const offsetX = (w - pW * blockSize) / 2;
        const offsetY = (h - pH * blockSize) / 2;

        const drawColor = holdPiece.color;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    drawBlock(offsetX/blockSize + c, offsetY/blockSize + r, drawColor, holdCtx, blockSize);
                }
            }
        }
    }
}

// ==================== ゲームロジック ====================

function checkCollision(dx, dy, newShape = currentPiece.shape, currentX = currentPiece.x, currentY = currentPiece.y) {
    const shape = newShape;
    const pieceX = currentX + dx;
    const pieceY = currentY + dy; 

    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                const newX = pieceX + c;
                const newY = pieceY + r;
                if (newX < 0 || newX >= COLS || newY >= ROWS) return true; 
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function fillNextQueue() {
    // 🌟 修正: Next QueueのサイズをNEXT_COUNT(5)に設定
    while (nextQueue.length < NEXT_COUNT) { 
        nextQueue.push(getNewRotatedPiece());
    }
}

function spawnPiece() {
    if (nextQueue.length === 0) fillNextQueue();
    
    // nextQueueの最初の要素をシフト
    const next = nextQueue.shift();
    fillNextQueue(); // 補充

    currentPiece = {
        shape: next.shape,
        color: next.color,
        x: Math.floor(COLS / 2) - Math.floor(next.shape[0].length / 2),
        y: -2 
    };
    currentRotation = 0; 
    
    // 🌟 修正点: 縦長ピースと特定ピース (F, T, W, Z, Z'など) を横向きにして出現させる
    const { width, height } = getPieceSize(currentPiece.shape);
    const pieceIndex = PIECES.findIndex(p => p.color === currentPiece.color && p.shape.length === currentPiece.shape.length);
    
    const specialRotatedIndices = [0, 1, 7, 8, 9, 12, 14, 15, 16, 17]; 

    const isVerticalPiece = (height > width && height >= 3);
    const isSpecialRotatedPiece = specialRotatedIndices.includes(pieceIndex); 

    if (isVerticalPiece || isSpecialRotatedPiece) {
         currentPiece.shape = rotateMatrix(currentPiece.shape);
         currentRotation = 1; // 1 (R) 状態にする

         // 回転後のピース位置を調整（中央揃えの再計算）
         const newW = currentPiece.shape[0].length;
         currentPiece.x = Math.floor(COLS / 2) - Math.floor(newW / 2);
    }

    drawNextQueue(); 

    if (checkCollision(0, 0)) {
        gameOver();
        return false;
    }
    return true;
}

function holdCurrentPiece() {
    if (!canHold || !currentPiece) return false;

    const pieceForHold = {
        shape: currentPiece.shape.map(row => [...row]),
        color: currentPiece.color
    };

    if (holdPiece === null) {
        holdPiece = pieceForHold;
        spawnPiece(); 
    } else {
        const swap = holdPiece;
        holdPiece = pieceForHold;
        
        currentPiece = {
            shape: swap.shape,
            color: swap.color,
            x: Math.floor(COLS / 2) - Math.floor(swap.shape[0].length / 2),
            y: -2
        };
        currentRotation = 0;
        // ホールドから出した直後の衝突チェック
        if (checkCollision(0, 0)) {
             gameOver();
             return false;
        }
    }

    canHold = false; 
    drawHoldPiece();
    return true;
}

function solidifyPiece() {
    const { shape, color, x, y } = currentPiece;
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                if (y + r >= 0 && y + r < ROWS && x + c >= 0 && x + c < COLS) {
                    board[y + r][x + c] = color;
                }
            }
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
            linesCleared++;
            r++; 
        }
    }
    
    if (linesCleared > 0) {
        updateScore(linesCleared);
    } else {
        combo = -1; 
    }
}

function updateScore(lines) {
    combo++;
    // 0, Single, Double, Triple, Quad, Pentris
    const basePoints = [0, 100, 300, 700, 1500, 4000]; 
    
    let points = (basePoints[lines] || 100) * level;
    if (combo > 0) points += (50 * combo * level);

    score += points;
    linesClearedTotal += lines;

    if (Math.floor(linesClearedTotal / 10) >= level) {
        level++;
        defaultDropInterval = Math.max(100, defaultDropInterval * 0.9); 
    }

    if (scoreElement) {
        scoreElement.textContent = `Score: ${score} (Lv.${level})`;
    }
}

function pieceMove(dx, dy) {
    if (checkCollision(dx, dy)) { 
        if (dy === 1) {
            solidifyPiece(); 
        }
        return false;
    }
    currentPiece.x += dx;
    currentPiece.y += dy;
    return true;
}

// 🌟 回転軸のオフセット計算ロジック
function pieceRotate(direction = 1) {
    if (!currentPiece) return false;

    const originalShape = currentPiece.shape;
    let newShape = direction === 1 ? rotateMatrix(originalShape) : rotateMatrixCCW(originalShape);

    const { width: oldW, height: oldH } = getPieceSize(originalShape);
    const { width: newW, height: newH } = getPieceSize(newShape);
    
    // --- 回転軸オフセット計算 ---
    
    let isCellCenter;

    // 1. Iピース (5マス) の判定
    if (oldW === 5 || oldH === 5) {
        isCellCenter = true; 
    } 
    // 2. 3x3 に収まるピースの判定
    else if (oldW <= 3 && oldH <= 3) {
        isCellCenter = true; 
    }
    // 3. その他 (4x2など) はグリッド間
    else {
        isCellCenter = false; 
    }

    let centerOffsetOldX, centerOffsetOldY;
    let centerOffsetNewX, centerOffsetNewY;

    if (isCellCenter) {
        centerOffsetOldX = Math.floor(oldW / 2);
        centerOffsetOldY = Math.floor(oldH / 2);
        centerOffsetNewX = Math.floor(newW / 2);
        centerOffsetNewY = Math.floor(newH / 2);
    } else {
        centerOffsetOldX = (oldW - 1) / 2;
        centerOffsetOldY = (oldH - 1) / 2;
        centerOffsetNewX = (newW - 1) / 2;
        centerOffsetNewY = (newH - 1) / 2;
    }
    
    const dxAdjust = Math.round(centerOffsetOldX - centerOffsetNewX);
    const dyAdjust = Math.round(centerOffsetOldY - centerOffsetNewY);
    
    // --- SRS キックテスト ---
    
    const oldState = currentRotation;
    const newState = (currentRotation + direction + 4) % 4;
    
    let kickIndex = direction === 1 ? oldState * 2 : newState * 2 + 1;
    const tests = KICK_TABLE[kickIndex]; 

    for (let i = 0; i < tests.length; i++) {
        const [dxKick, dyKick] = tests[i];
        
        const dx = dxKick + dxAdjust;
        const dy = dyKick + dyAdjust;

        if (!checkCollision(dx, dy, newShape, currentPiece.x, currentPiece.y)) {
            currentPiece.shape = newShape; 
            currentPiece.x += dx;
            currentPiece.y += dy;
            currentRotation = newState; 
            return true;
        }
    }
    return false;
}

function hardDrop() {
    const dropY = getDropY();
    score += (dropY - currentPiece.y) * 2; 
    if(scoreElement) scoreElement.textContent = `Score: ${score} (Lv.${level})`;
    
    currentPiece.y = dropY;
    solidifyPiece();
    drawBoard();
}

// ==================== メイン処理 ====================

function gameOver() {
    clearInterval(gameLoop);
    alert(`Game Over!\nFinal Score: ${score}\nLevel: ${level}`);
    initBoard();
}

function gameTick() {
    if (currentPiece) {
        pieceMove(0, 1);
    }
    drawBoard();
}

function resetGameLoop(interval) {
    clearInterval(gameLoop);
    gameLoop = setInterval(gameTick, interval);
}

function startGame() {
    // 🌟 修正: ゲームが既に始まっている場合は無視
    if (gameLoop !== null) return;

    initBoard();
}

function initBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0;
    level = 1;
    combo = -1;
    linesClearedTotal = 0;
    defaultDropInterval = 800;
    currentDropInterval = defaultDropInterval;
    
    if (scoreElement) scoreElement.textContent = `Score: 0 (Lv.1)`;
    
    // 🌟 修正: Next Queueを5つ分確保
    nextQueue = [];
    holdPiece = null;
    canHold = true; 
    
    fillNextQueue();
    spawnPiece();
    resetGameLoop(defaultDropInterval);
    drawHoldPiece();
    drawNextQueue();
    drawBoard();
}

// ==================== 入力イベント ====================

document.addEventListener('keydown', (e) => {
    // 🌟 追加: currentPieceがnull (ゲーム開始前またはゲームオーバー後) の場合、Enterでスタート
    if (currentPiece === null && e.key === 'Enter') {
        startGame();
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
            pieceMove(0, 1);
            score += 1; 
            break;
        case 'ArrowUp': 
        case 'x': 
        case 'X': pieceRotate(1); break;
        case 'z': 
        case 'Z': pieceRotate(-1); break;
        case ' ': 
            e.preventDefault(); // スクロール防止
            hardDrop(); 
            break;
        case 'c': 
        case 'C': holdCurrentPiece(); break;
    }
    drawBoard();
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown') {
        currentDropInterval = defaultDropInterval;
        resetGameLoop(currentDropInterval);
    }
});

// --- モバイルボタン制御 (HTMLには未実装だが、ロジックは残す) ---
const setupBtn = (id, action) => {
    const btn = document.getElementById(id);
    if(btn) {
        btn.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            action(); 
            drawBoard(); 
        }, {passive: false});
        
        btn.addEventListener('click', (e) => {
             action(); 
             drawBoard(); 
        });
    }
};

setupBtn('btn-left', () => pieceMove(-1, 0));
setupBtn('btn-right', () => pieceMove(1, 0));
setupBtn('btn-rotate', () => pieceRotate(1));
setupBtn('btn-harddrop', () => hardDrop());
setupBtn('btn-hold', () => holdCurrentPiece());

const btnDown = document.getElementById('btn-down');
if(btnDown) {
    const startDown = (e) => {
        if(e.cancelable) e.preventDefault();
        if(currentDropInterval === defaultDropInterval) {
            currentDropInterval = defaultDropInterval / SOFT_DROP_MULTIPLIER;
            resetGameLoop(currentDropInterval);
            pieceMove(0, 1); 
            drawBoard();
        }
    };
    const endDown = (e) => {
        if(e.cancelable) e.preventDefault();
        currentDropInterval = defaultDropInterval;
        resetGameLoop(currentDropInterval);
    };
    
    btnDown.addEventListener('mousedown', startDown);
    btnDown.addEventListener('mouseup', endDown);
    btnDown.addEventListener('mouseleave', endDown);
    
    btnDown.addEventListener('touchstart', startDown, {passive:false});
    btnDown.addEventListener('touchend', endDown);
    btnDown.addEventListener('touchcancel', endDown);
}

// 初期化実行（待機状態）
drawBoard();