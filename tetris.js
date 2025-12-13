// ==================== ゲーム設定 (ペントミノ向けに拡張) ====================
const COLS = 12; // 12マスに拡張
const ROWS = 22; // 22マスに拡張
const BLOCK_SIZE = 20; 

const canvas = document.getElementById('tetris-canvas');
const ctx = canvas.getContext('2d');
// canvasが存在するか確認し、存在しない場合はエラーを避ける
if (canvas) {
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
}

const nextCanvas = document.getElementById('next-piece-canvas');
const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;

// 🌟 追加: ホールド用キャンバスの取得
const holdCanvas = document.getElementById('hold-piece-canvas');
const holdCtx = holdCanvas ? holdCanvas.getContext('2d') : null;

let score = 0;
let currentPiece = null;
let nextPiece = null;
let gameLoop = null;
let dropInterval = 500; 
const SOFT_DROP_MULTIPLIER = 10;
let currentDropInterval = dropInterval;

// 🌟 追加: ホールド関連グローバル変数
let holdPiece = null;
let canHold = true; 

// ==================== ペントミノの定義 (18種類: 全て異なる色) ====================
const PIECES = [
    // --- F と Fの鏡像 ---
    { shape: [[0,1,1],[1,1,0],[0,1,0]], color: '#FF5733' }, // F
    { shape: [[1,1,0],[0,1,1],[0,1,0]], color: '#FF8D6A' }, // F Mirrored (F')

    // --- I (線対称) ---
    { shape: [[1],[1],[1],[1],[1]], color: '#00BFFF' }, // I 

    // --- L と Lの鏡像 ---
    { shape: [[1,0],[1,0],[1,0],[1,1]], color: '#1E90FF' }, // L
    { shape: [[0,1],[0,1],[0,1],[1,1]], color: '#4682B4' }, // L Mirrored (L')

    // --- P と Pの鏡像 ---
    { shape: [[1,1],[1,1],[1,0]], color: '#FFD700' }, // P 
    { shape: [[1,1],[1,1],[0,1]], color: '#FFA500' }, // P Mirrored (P')
    
    // --- N と Nの鏡像 ---
    { shape: [[0,1],[1,1],[1,0],[1,0]], color: '#9932CC' }, // N 
    { shape: [[1,0],[1,1],[0,1],[0,1]], color: '#BA55D3' }, // N Mirrored (N')
    
    // --- T (線対称) ---
    { shape: [[1,1,1],[0,1,0],[0,1,0]], color: '#800080' }, // T

    // --- U (線対称) ---
    { shape: [[1,0,1],[1,1,1],[0,0,0]], color: '#3CB371' }, // U
    
    // --- V (線対称) ---
    { shape: [[1,0,0],[1,0,0],[1,1,1]], color: '#4169E1' }, // V
    
    // --- W (線対称) ---
    { shape: [[1,0,0],[1,1,0],[0,1,1]], color: '#DA70D6' }, // W
    
    // --- X (線対称) ---
    { shape: [[0,1,0],[1,1,1],[0,1,0]], color: '#DC143C' }, // X
    
    // --- Y と Yの鏡像 ---
    { shape: [[0,1],[1,1],[0,1],[0,1]], color: '#20B2AA' }, // Y 
    { shape: [[1,0],[1,1],[1,0],[1,0]], color: '#008080' }, // Y Mirrored (Y')
    
    // --- Z と Zの鏡像 ---
    { shape: [[1,1,0],[0,1,0],[0,1,1]], color: '#B22222' }, // Z 
    { shape: [[0,1,1],[0,1,0],[1,1,0]], color: '#CD5C5C' }, // Z Mirrored (Z')
];

// ==================== ユーティリティ関数 ====================

/**
 * ピースを回転させる関数 (行列の転置と反転)
 */
function rotateMatrix(matrix) {
    let newMatrix = matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    newMatrix = newMatrix.map(row => row.reverse());
    return newMatrix;
}

/**
 * 🌟 追加: 新しいピースをランダムに選択し、最も長い辺が横になるように初期回転させる
 */
function getNewRotatedPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const piece = PIECES[index];
    let shape = piece.shape.map(row => [...row]); // 形状をディープコピー
    
    let pieceHeight = shape.length;
    let pieceWidth = shape[0].length;
    
    // ピースの最も長い辺を横方向にするために回転させる
    if (pieceHeight > pieceWidth) {
        shape = rotateMatrix(shape);
    }
    
    return { 
        shape: shape,
        color: piece.color,
        // x and y は spawnPiece で設定
    };
}


// ==================== 描画関数 ====================

function drawBlock(x, y, color, context, size) {
    if (color && x >= 0 && y >= 0) {
        context.fillStyle = color;
        context.fillRect(x * size, y * size, size, size);
        context.strokeStyle = '#000';
        context.lineWidth = 1;
        context.strokeRect(x * size, y * size, size, size);
    }
}

function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    // 1. 固定されたブロックの描画
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) { 
                drawBlock(c, r, board[r][c], ctx, BLOCK_SIZE);
            }
        }
    }

    // 2. 現在のペントミノの描画
    if (currentPiece) {
        const shape = currentPiece.shape;
        const color = currentPiece.color;
        const x = currentPiece.x;
        const y = currentPiece.y;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] && y + r >= 0) {
                    drawBlock(x + c, y + r, color, ctx, BLOCK_SIZE);
                }
            }
        }
    }
}

function drawNextPiece() {
    if (!nextCtx || !nextCanvas) return;
    
    // 🌟 修正: ネクストピースのキャンバスサイズに基づいた、新しいブロックサイズを計算
    const canvasWidth = nextCanvas.width; // 80
    const canvasHeight = nextCanvas.height; // 80
    const maxDimension = 5; // ペントミノの最大ブロック数 (Yピースが 5x1)
    const pieceBlockSize = Math.floor(canvasWidth / maxDimension); // 80 / 5 = 16

    nextCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (nextPiece) {
        const shape = nextPiece.shape;
        const color = nextPiece.color;
        
        // ピースを中央に寄せるためのオフセット計算
        const pieceWidthBlocks = shape[0].length;
        const pieceHeightBlocks = shape.length;
        
        // ピクセル単位ではなく、ブロック単位でのオフセット
        const offsetXBlocks = (maxDimension - pieceWidthBlocks) / 2;
        const offsetYBlocks = (maxDimension - pieceHeightBlocks) / 2;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    // drawBlock には、ブロック単位の位置と、計算した新しいブロックサイズを渡す
                    drawBlock(offsetXBlocks + c, offsetYBlocks + r, color, nextCtx, pieceBlockSize);
                }
            }
        }
    }
}

/**
 * 🌟 追加: ホールドピースを描画する関数
 */
function drawHoldPiece() {
    if (!holdCtx || !holdCanvas) return;
    
    // 🌟 修正: ホールドピースのキャンバスサイズに基づいた、新しいブロックサイズを計算
    const canvasWidth = holdCanvas.width; // 120
    const canvasHeight = holdCanvas.height; // 120
    const maxDimension = 6; // ホールドピースが最大 5x5 なので、少し余裕を持って 6x6 を基準にする
    const pieceBlockSize = Math.floor(canvasWidth / maxDimension); // 120 / 6 = 20 (元のサイズと一致)

    holdCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (holdPiece) {
        const shape = holdPiece.shape;
        const color = holdPiece.color;
        
        const pieceWidthBlocks = shape[0].length;
        const pieceHeightBlocks = shape.length;
        
        const offsetXBlocks = (maxDimension - pieceWidthBlocks) / 2;
        const offsetYBlocks = (maxDimension - pieceHeightBlocks) / 2;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    drawBlock(offsetXBlocks + c, offsetYBlocks + r, color, holdCtx, pieceBlockSize);
                }
            }
        }
    }
}


// ==================== ゲームロジック ====================

function checkCollision(dx, dy, newShape = currentPiece.shape) {
    const shape = newShape;
    const pieceX = currentPiece.x + dx;
    const pieceY = currentPiece.y + dy;

    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                const newX = pieceX + c;
                const newY = pieceY + r;

                if (newX < 0 || newX >= COLS) return true;
                if (newY >= ROWS) return true; 
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function spawnPiece() {
    // 🌟 修正: getNewRotatedPiece() を使用して、最初から横長向きのピースを取得する
    if (!nextPiece) {
        nextPiece = getNewRotatedPiece();
    }

    currentPiece = {
        shape: nextPiece.shape,
        color: nextPiece.color,
        // x座標は新しいshapeの幅に基づいて設定
        x: Math.floor(COLS / 2) - Math.floor(nextPiece.shape[0].length / 2),
        y: 0 
    };
    
    // 次のネクストピース生成
    nextPiece = getNewRotatedPiece();
    drawNextPiece();

    if (checkCollision(0, 0)) {
        gameOver();
        return false;
    }
    return true;
}

/**
 * 🌟 追加: 現在のピースとホールドピースを入れ替える
 */
function holdCurrentPiece() {
    if (!canHold || !currentPiece) {
        return false;
    }

    // 現在のピースの形状と色をコピーして一時保存
    const pieceForHold = {
        shape: currentPiece.shape.map(row => [...row]),
        color: currentPiece.color
    };

    if (holdPiece === null) {
        // 1. ホールドスロットが空の場合
        holdPiece = pieceForHold;
        spawnPiece(); // 次のピースをスポーン
    } else {
        // 2. ホールドスロットにピースがある場合
        const pieceToSpawn = holdPiece;
        holdPiece = pieceForHold; // 現在のピースをホールド

        // ホールドピースを現在のピースとしてスポーン
        currentPiece = {
            shape: pieceToSpawn.shape,
            color: pieceToSpawn.color,
            x: Math.floor(COLS / 2) - Math.floor(pieceToSpawn.shape[0].length / 2),
            y: 0
        };
        
        // スポーン直後の衝突チェック
        if (checkCollision(0, 0)) {
            gameOver();
            return false;
        }
        drawNextPiece(); // ネクストは変更なしだが念のため描画
    }

    canHold = false; // 1ターンに1回の制限を適用
    drawHoldPiece();
    return true;
}


function solidifyPiece() {
    const shape = currentPiece.shape;
    const color = currentPiece.color;
    const x = currentPiece.x;
    const y = currentPiece.y;

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
    canHold = true; // 🌟 追加: 固定後、ホールドを可能にする
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
    }
}

function updateScore(lines) {
    const points = [0, 100, 300, 500, 800];
    score += points[lines] || 0;
    document.getElementById('score').textContent = score;
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

function pieceRotate() {
    const originalShape = currentPiece.shape;
    const newShape = rotateMatrix(originalShape);

    if (!checkCollision(0, 0, newShape)) {
        currentPiece.shape = newShape; 
    } 
}

function hardDrop() {
    while (currentPiece && pieceMove(0, 1)) {
    }
}

// ==================== メインゲーム処理 ====================

function gameOver() {
    clearInterval(gameLoop);
    alert('Game Over! Your final score is: ' + score);
    currentPiece = null;
    drawBoard();
}

function gameTick() {
    if (currentPiece) {
        pieceMove(0, 1);
    }
    drawBoard();
    drawHoldPiece(); // 🌟 追加: ホールドピースの描画
}

function resetGameLoop(interval) {
    clearInterval(gameLoop);
    gameLoop = setInterval(gameTick, interval);
}

function initBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0;
    document.getElementById('score').textContent = score;
    currentDropInterval = dropInterval;
    
    // 🌟 追加: ホールド関連の初期化
    holdPiece = null;
    canHold = true; 
}

function startGame() {
    initBoard();
    drawHoldPiece(); // 🌟 追加: ホールドスロットを空で描画
    // ネクストピースを事前に生成
    nextPiece = getNewRotatedPiece(); 
    if (spawnPiece()) {
        resetGameLoop(currentDropInterval); 
    }
}

// ==================== キーボード操作 ====================
document.addEventListener('keydown', (e) => {
    if (!currentPiece) return;

    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault(); 
            pieceMove(-1, 0); 
            break;
        case 'ArrowRight':
            e.preventDefault(); 
            pieceMove(1, 0);
            break;
        case 'ArrowDown':
            e.preventDefault(); 
            if (currentDropInterval === dropInterval) {
                currentDropInterval = dropInterval / SOFT_DROP_MULTIPLIER;
                resetGameLoop(currentDropInterval);
            }
            pieceMove(0, 1);
            break;
        case 'ArrowUp':
            e.preventDefault(); 
        case 'z':
        case 'Z':
            pieceRotate();
            break;
        case ' ': // Space key
            e.preventDefault(); 
            hardDrop();
            break;
        case 'c': // 🌟 ホールド機能
        case 'C':
            e.preventDefault();
            holdCurrentPiece(); 
            break;
        default:
            return;
    }
    drawBoard();
    drawHoldPiece(); // 🌟 ホールド後の描画更新
    drawNextPiece(); // 🌟 ホールド後の描画更新
    // ホールドや移動でゲームオーバーになった場合のためにチェック
    if (!currentPiece) gameOver(); 
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown') {
        // ソフトドロップ解除
        if (currentDropInterval !== dropInterval) {
            currentDropInterval = dropInterval;
            resetGameLoop(currentDropInterval);
        }
    }
});


// ==================== 🌟 追加: モバイルボタン操作 ====================

// ボタンの取得
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnDown = document.getElementById('btn-down');
const btnRotate = document.getElementById('btn-rotate');
const btnHarddrop = document.getElementById('btn-harddrop');
const btnHold = document.getElementById('btn-hold');

// 基本的なアクション（移動、回転、ハードドロップ、ホールド）
if (btnLeft) btnLeft.addEventListener('click', () => { 
    if (currentPiece) {
        pieceMove(-1, 0); 
        drawBoard(); 
    }
});
if (btnRight) btnRight.addEventListener('click', () => { 
    if (currentPiece) {
        pieceMove(1, 0); 
        drawBoard(); 
    }
});
if (btnRotate) btnRotate.addEventListener('click', () => { 
    if (currentPiece) {
        pieceRotate(); 
        drawBoard(); 
    }
});
if (btnHarddrop) btnHarddrop.addEventListener('click', () => { 
    if (currentPiece) {
        hardDrop(); 
        drawBoard();
        drawHoldPiece(); 
        drawNextPiece(); 
        if (!currentPiece) gameOver(); 
    }
});
if (btnHold) btnHold.addEventListener('click', () => { 
    if (currentPiece) {
        holdCurrentPiece(); 
        drawBoard();
        drawHoldPiece(); 
        drawNextPiece(); 
        if (!currentPiece) gameOver(); 
    }
});


// ソフトドロップ (長押しで加速、離すと通常速度に戻る)
if (btnDown) {
    const startSoftDrop = () => {
        if (currentPiece && currentDropInterval === dropInterval) {
            currentDropInterval = dropInterval / SOFT_DROP_MULTIPLIER;
            resetGameLoop(currentDropInterval);
            pieceMove(0, 1); // 最初の1マス移動
            drawBoard(); 
        }
    };

    const stopSoftDrop = () => {
        if (currentDropInterval !== dropInterval) {
            currentDropInterval = dropInterval;
            resetGameLoop(currentDropInterval);
        }
    };
    
    // PC/モバイル両方に対応
    btnDown.addEventListener('mousedown', startSoftDrop);
    btnDown.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startSoftDrop();
    });

    btnDown.addEventListener('mouseup', stopSoftDrop);
    btnDown.addEventListener('touchend', stopSoftDrop);
    btnDown.addEventListener('touchcancel', stopSoftDrop); // タッチがキャンセルされた場合も停止
}