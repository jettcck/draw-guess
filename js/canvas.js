// ============================================
// canvas.js - 画板绘制与笔画同步（坐标归一化）
// ============================================

let canvas, ctx;
let canvasW = 800, canvasH = 500; // 当前设备实际 CSS 像素尺寸
let isDrawing = false;
let currentPath = []; // 存储归一化坐标 [{x: 0-1, y: 0-1}, ...]
let canvasInitialized = false;

// 固定逻辑画布（所有设备统一坐标空间）
const VW = 800, VH = 500;

function initCanvas() {
  canvas = document.getElementById('draw-canvas');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    replayAllStrokes(G.strokes);
  });

  // 鼠标事件
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDrawing);
  canvas.addEventListener('mouseleave', endDrawing);

  // 触摸事件（移动端，传原始 Touch 对象，由 getNormalizedPos 统一处理）
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e.touches[0]);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e.touches[0]);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    endDrawing();
  });

  // 清空画布按钮
  document.getElementById('btn-clear').onclick = async () => {
    clearCanvasLocal();
    await sendClearSignal();
  };

  canvasInitialized = true;
}

function resizeCanvas() {
  if (!canvas) return;
  const area = document.getElementById('canvas-area');
  const rect = area.getBoundingClientRect();

  canvasW = Math.max(rect.width - 4, 200);
  canvasH = Math.max(rect.height - 4, 150);

  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// 获取归一化坐标（0-1 范围，适配所有设备）
function getNormalizedPos(source) {
  const rect = canvas.getBoundingClientRect();
  let px, py;
  if (source.offsetX !== undefined) {
    px = source.offsetX;
    py = source.offsetY;
  } else {
    px = source.clientX - rect.left;
    py = source.clientY - rect.top;
  }
  return {
    x: px / (rect.width || 1),
    y: py / (rect.height || 1),
  };
}

// 归一化坐标 → 实际像素坐标
function toPixel(norm) {
  return { x: norm.x * canvasW, y: norm.y * canvasH };
}

function startDrawing(e) {
  if (!G.isDrawer) return;
  isDrawing = true;
  currentPath = [];

  const pos = getNormalizedPos(e);
  currentPath.push(pos);

  const px = toPixel(pos);
  ctx.beginPath();
  ctx.arc(px.x, px.y, G.isEraser ? G.brushWidth * 4 : G.brushWidth / 2, 0, Math.PI * 2);
  ctx.fillStyle = G.isEraser ? '#FFFFFF' : G.brushColor;
  ctx.fill();
}

function draw(e) {
  if (!isDrawing || !G.isDrawer) return;
  const pos = getNormalizedPos(e);

  // 点稀疏化（归一化空间内阈值）
  const lastPt = currentPath[currentPath.length - 1];
  if (lastPt) {
    const dx = (pos.x - lastPt.x) * VW;
    const dy = (pos.y - lastPt.y) * VH;
    if (Math.sqrt(dx * dx + dy * dy) < 1.5) return;
  }

  // 长笔画自动切分
  if (currentPath.length >= 500) {
    const oldPath = [...currentPath];
    currentPath = [oldPath[oldPath.length - 1]];
    sendStroke(oldPath);
  }

  currentPath.push(pos);

  // 绘制到画布
  const prev = currentPath[currentPath.length - 2];
  if (prev) {
    const p1 = toPixel(prev);
    const p2 = toPixel(pos);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = G.isEraser ? '#FFFFFF' : G.brushColor;
    ctx.lineWidth = G.isEraser ? G.brushWidth * 5 : G.brushWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

async function endDrawing() {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentPath.length === 0) return;
  await sendStroke(currentPath);
  currentPath = [];
}

async function sendStroke(path) {
  if (path.length === 0) return;

  const strokeData = {
    room_id: G.roomId,
    player_id: G.playerId,
    data: [...path],
    color: G.isEraser ? '#FFFFFF' : G.brushColor,
    stroke_width: G.isEraser ? G.brushWidth * 5 : G.brushWidth,
  };

  G.strokes.push(strokeData);

  // WebSocket 广播（低延迟 < 50ms）
  if (G.channels.strokes) {
    G.channels.strokes.send({ type: 'broadcast', event: 'stroke', payload: strokeData }).catch(() => {});
  }

  // DB 持久化（新玩家加入时加载历史用）
  gameDb.from('strokes').insert(strokeData).then(r => {
    if (r.error) console.error('笔画持久化失败:', r.error);
  });
}

async function sendClearSignal() {
  const clearStroke = {
    room_id: G.roomId,
    player_id: G.playerId,
    data: [{ x: -1, y: -1 }],
    color: '#CLEAR',
    stroke_width: 0,
  };
  G.strokes.push(clearStroke);

  // WebSocket 广播清屏
  if (G.channels.strokes) {
    G.channels.strokes.send({ type: 'broadcast', event: 'clear', payload: {} }).catch(() => {});
  }

  // DB 持久化
  gameDb.from('strokes').insert(clearStroke).then(r => {});
}

// ============ 清空与重绘 ============

function clearCanvasLocal() {
  if (!canvas || !ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);
}

function replayAllStrokes(strokes) {
  if (!canvas || !ctx) return;

  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    replayStrokeOnCanvas(stroke);
  }
}

function replayStroke(stroke) {
  if (!ctx) return;
  if (stroke.data && stroke.data.length === 1 && stroke.data[0].x === -1 && stroke.data[0].y === -1) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
    return;
  }
  replayStrokeOnCanvas(stroke);
}

function replayStrokeOnCanvas(stroke) {
  if (!ctx) return;
  const data = stroke.data;
  if (!data || !Array.isArray(data) || data.length === 0) return;
  if (data[0].x === -1 && data[0].y === -1) return;

  ctx.strokeStyle = stroke.color || '#000000';
  ctx.lineWidth = Math.max(stroke.stroke_width || 3, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (data.length === 1) {
    const px = toPixel(data[0]);
    ctx.beginPath();
    ctx.arc(px.x, px.y, Math.max(stroke.stroke_width || 3, 2) / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color || '#000000';
    ctx.fill();
  } else {
    ctx.beginPath();
    const p0 = toPixel(data[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < data.length; i++) {
      const pi = toPixel(data[i]);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.stroke();
  }
}

// ============ 初始化入口 ============
function setupGameCanvas() {
  if (!canvasInitialized) {
    initCanvas();
  } else {
    resizeCanvas();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
}

function updateBrushCursor() {
  if (!canvas) return;
  if (!G.isDrawer) {
    canvas.style.cursor = 'default';
  } else if (G.isEraser) {
    canvas.style.cursor = 'cell';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}
