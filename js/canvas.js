// ============================================
// canvas.js - 画板绘制与笔画同步
// ============================================

let canvas, ctx;
let canvasW = 800, canvasH = 500; // CSS 像素尺寸
let isDrawing = false;
let currentPath = [];
let canvasInitialized = false;

function initCanvas() {
  canvas = document.getElementById('draw-canvas');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    // resize 后需要完整重绘（CLEAR 标记用于重置画布状态）
    replayAllStrokes(G.strokes);
  });

  // 鼠标事件
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDrawing);
  canvas.addEventListener('mouseleave', endDrawing);

  // 触摸事件（移动端）
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const sx = canvasW / rect.width;
    const sy = canvasH / rect.height;
    startDrawing({
      offsetX: (touch.clientX - rect.left) * sx,
      offsetY: (touch.clientY - rect.top) * sy,
    });
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const sx = canvasW / rect.width;
    const sy = canvasH / rect.height;
    draw({
      offsetX: (touch.clientX - rect.left) * sx,
      offsetY: (touch.clientY - rect.top) * sy,
    });
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

  // 重置变换矩阵并应用 DPR 缩放
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 初始化白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvasW / rect.width;
  const sy = canvasH / rect.height;
  return {
    x: (e.offsetX !== undefined ? e.offsetX : (e.clientX - rect.left)) * sx,
    y: (e.offsetY !== undefined ? e.offsetY : (e.clientY - rect.top)) * sy,
  };
}

function startDrawing(e) {
  if (!G.isDrawer) return;
  isDrawing = true;
  currentPath = [];

  const pos = getPos(e);
  currentPath.push({ x: pos.x, y: pos.y });

  // 画一个点（用于点击）
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, G.isEraser ? G.brushWidth * 4 : G.brushWidth / 2, 0, Math.PI * 2);
  ctx.fillStyle = G.isEraser ? '#FFFFFF' : G.brushColor;
  ctx.fill();
}

function draw(e) {
  if (!isDrawing || !G.isDrawer) return;
  const pos = getPos(e);

  // 点稀疏化：距离上一个记录点太近（< 2px）则跳过
  const lastPt = currentPath[currentPath.length - 1];
  if (lastPt) {
    const dx = pos.x - lastPt.x;
    const dy = pos.y - lastPt.y;
    if (Math.sqrt(dx * dx + dy * dy) < 2) return;
  }

  // 限制单笔画点数（超过上限自动切分）
  if (currentPath.length >= 500) {
    // 结束当前笔画并发起新笔画
    const oldPath = [...currentPath];
    currentPath = [oldPath[oldPath.length - 1]]; // 保持连续性
    sendStroke(oldPath);
  }

  currentPath.push({ x: pos.x, y: pos.y });

  const prev = currentPath[currentPath.length - 2];
  if (prev) {
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
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

  const { error } = await gameDb
    .from('strokes')
    .insert(strokeData);

  if (error) {
    console.error('笔画同步失败:', error);
  }
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

  await gameDb.from('strokes').insert(clearStroke);
}

// ============ 清空与重绘 ============

function clearCanvasLocal() {
  if (!canvas || !ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);
}

function replayAllStrokes(strokes) {
  if (!canvas || !ctx) return;

  // 重置画布
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
  // 检查是否是清屏信号
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
  if (data[0].x === -1 && data[0].y === -1) return; // 正常播放时跳过清屏信号

  ctx.strokeStyle = stroke.color || '#000000';
  ctx.lineWidth = stroke.stroke_width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (data.length === 1) {
    ctx.beginPath();
    ctx.arc(data[0].x, data[0].y, Math.max(stroke.stroke_width || 3, 2) / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color || '#000000';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(data[0].x, data[0].y);
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(data[i].x, data[i].y);
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
