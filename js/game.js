// ============================================
// game.js - 全局状态管理与游戏核心逻辑
// ============================================

const G = {
  // 玩家信息
  playerName: '',
  playerId: null,

  // 房间信息
  roomId: null,
  roomCode: '',
  isHost: false,

  // 游戏状态
  gameStatus: 'waiting', // waiting | drawing | guessing | round_end | ended
  isDrawer: false,
  currentWord: '',
  currentRound: 1,
  maxRounds: 3,
  currentDrawerId: null,
  roundTime: 60,
  timerSeconds: 60,
  timerInterval: null,
  _roundTransitioning: false, // 防止重复触发轮次切换

  // 数据缓存
  players: [],
  strokes: [],
  correctGuessers: new Set(),  // 本轮已猜对的玩家（防止重复加分）

  // Supabase 订阅频道
  channels: {},

  // 工具状态
  brushColor: '#000000',
  brushWidth: 3,
  isEraser: false,
};

// 预设颜色
G.COLORS = ['#000000', '#FFFFFF', '#E74C3C', '#E91E63', '#9B59B6', '#6C5CE7', '#3498DB', '#00CEC9', '#00B894', '#FDCB6E', '#E17055', '#795548', '#95A5A6'];
// 预设画笔粗细
G.SIZES = [2, 4, 6, 10, 16];

// ============ 工具函数 ============
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的字符
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function showModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fadeout');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============ 游戏状态机 ============
function startTimer(seconds, onTick, onEnd) {
  clearInterval(G.timerInterval);
  G.timerSeconds = seconds;
  G._roundTransitioning = false;
  const timerEl = document.getElementById('game-timer');
  if (timerEl) {
    timerEl.textContent = seconds;
    timerEl.className = 'timer';
    timerEl.style.visibility = 'visible';
  }

  G.timerInterval = setInterval(() => {
    G.timerSeconds--;
    if (timerEl) {
      timerEl.textContent = G.timerSeconds;
      if (G.timerSeconds <= 10) timerEl.className = 'timer danger';
      else if (G.timerSeconds <= 20) timerEl.className = 'timer warning';
    }
    if (onTick) onTick(G.timerSeconds);

    if (G.timerSeconds <= 0) {
      clearInterval(G.timerInterval);
      if (onEnd) onEnd();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(G.timerInterval);
}

// ============ 更新 UI ============
function updateGameUI() {
  // 更新轮次
  document.getElementById('game-round').textContent =
    `第 ${G.currentRound}/${G.maxRounds} 轮`;

  // 更新房间码
  document.getElementById('game-code').textContent = G.roomCode;

  // 更新词语显示
  const wordEl = document.getElementById('game-word');
  if (!G.currentWord && G.isDrawer) {
    wordEl.textContent = '输入题目...';
    wordEl.classList.remove('hidden');
  } else if (!G.currentWord && !G.isDrawer && (G.gameStatus === 'drawing' || G.gameStatus === 'guessing')) {
    wordEl.textContent = '等待画手出题...';
    wordEl.classList.add('hidden');
  } else if (G.isDrawer) {
    wordEl.textContent = G.currentWord;
    wordEl.classList.remove('hidden');
  } else if (G.gameStatus === 'drawing' || G.gameStatus === 'guessing') {
    const hint = G.currentWord.replace(/[^\s]/g, '_ ');
    wordEl.textContent = hint.trim();
    wordEl.classList.add('hidden');
  } else {
    wordEl.textContent = '????';
    wordEl.classList.add('hidden');
  }

  // 倒计时显示：等题目时隐藏
  const timerEl = document.getElementById('game-timer');
  if ((G.gameStatus === 'drawing' || G.gameStatus === 'guessing') && !G.currentWord && !G.isDrawer) {
    timerEl.style.visibility = 'hidden';
  } else {
    timerEl.style.visibility = 'visible';
  }

  // 显示/隐藏工具栏
  document.getElementById('toolbar').style.display = G.isDrawer ? 'flex' : 'none';

  // 画布可绘制性
  const canvasArea = document.getElementById('canvas-area');
  if (!G.isDrawer) {
    canvasArea.classList.add('no-draw');
  } else {
    canvasArea.classList.remove('no-draw');
  }

  // 聊天输入
  const chatInput = document.getElementById('chat-input');
  const chatInputArea = document.getElementById('chat-input-area');
  if (G.isDrawer) {
    chatInputArea.style.display = 'none';
  } else {
    chatInputArea.style.display = 'flex';
    chatInput.placeholder = '输入你的猜测...';
  }

  // 占位文字
  const placeholder = document.getElementById('canvas-placeholder');
  if (G.isDrawer) {
    placeholder.textContent = `请画「${G.currentWord}」`;
  } else if (!G.currentDrawerId) {
    placeholder.textContent = '等待绘画者开始作画...';
  } else {
    placeholder.textContent = '猜猜看画的是什么？在右侧输入你的答案！';
  }
}

function updatePlayerList() {
  // 更新大厅玩家列表
  const lobbyList = document.getElementById('lobby-players');
  if (lobbyList) {
    if (G.players.length === 0) {
      lobbyList.innerHTML = '<li class="lobby-player" style="color: var(--text-muted);">等待玩家加入...</li>';
    } else {
      lobbyList.innerHTML = G.players.map(p => `
        <li class="lobby-player">
          <span style="font-size: 20px;">${p.is_host ? '👑' : '🎭'}</span>
          <span style="flex:1; font-weight:600;">${escapeHtml(p.name)}</span>
          ${p.is_host ? '<span style="font-size:12px;color:var(--text-muted);">房主</span>' : ''}
        </li>
      `).join('');
    }
  }

  // 更新按钮
  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.disabled = G.players.length < 2;
    btnStart.textContent = G.players.length < 2
      ? '🎮 开始游戏（至少2人）'
      : `🎮 开始游戏（${G.players.length}人）`;
  }

  // 更新游戏内玩家列表
  const gamePlayersEl = document.getElementById('game-players');
  if (gamePlayersEl) {
    gamePlayersEl.innerHTML = G.players
      .sort((a, b) => b.score - a.score)
      .map(p => `
        <div class="player-item">
          <div class="info">
            <span style="font-size:18px;">${p.is_host ? '👑' : '🎭'}</span>
            <span class="name">${escapeHtml(p.name)}</span>
            ${p.id === G.currentDrawerId ? '<span class="drawer-badge">绘画中</span>' : ''}
          </div>
          <span class="score">${p.score}分</span>
        </div>
      `).join('');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ 订阅管理 ============
async function subscribeToRoom() {
  // 1. 订阅玩家变化
  G.channels.players = gameDb
    .channel('room-players-' + G.roomId)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${G.roomId}` },
      (payload) => {
        loadPlayers();
      }
    )
    .subscribe();

  // 2. 订阅房间变化
  G.channels.room = gameDb
    .channel('room-updates-' + G.roomId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${G.roomId}` },
      (payload) => {
        handleRoomUpdate(payload.new);
      }
    )
    .subscribe();

  // 3. 订阅笔画（仅 WebSocket 广播；DB 只用于加载历史，不做实时监听避免双重回放）
  G.channels.strokes = gameDb
    .channel('room-strokes-' + G.roomId, {
      config: { broadcast: { self: false } }
    })
    .on('broadcast', { event: 'stroke' }, (payload) => {
      // WebSocket 广播：延迟极低（<50ms）
      handleNewStroke(payload.payload);
    })
    .on('broadcast', { event: 'clear' }, (payload) => {
      // WebSocket 清屏广播
      handleNewStroke({ data: [{ x: -1, y: -1 }], color: '#CLEAR' });
    })
    .subscribe();

  // 4. 订阅消息
  G.channels.messages = gameDb
    .channel('room-messages-' + G.roomId)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${G.roomId}` },
      (payload) => {
        handleNewMessage(payload.new);
      }
    )
    .subscribe();
}

function handleRoomUpdate(room) {
  if (!room) return;
  const prevStatus = G.gameStatus;
  const prevWord = G.currentWord;
  G.gameStatus = room.status;
  G.currentWord = room.current_word || '';
  G.currentRound = room.round || 1;
  G.maxRounds = room.max_rounds || 3;
  G.roundTime = room.round_seconds || 60;
  G.currentDrawerId = room.drawer_id;

  if (room.status === 'waiting' && prevStatus !== 'waiting' && prevStatus !== '') {
    // 从游戏结束回到大厅
    handleBackToLobby();
  }

  if (room.status === 'round_end' && prevStatus !== 'round_end') {
    handleRoundEnd();
  }

  if (room.status === 'ended' && prevStatus !== 'ended') {
    handleGameEnd();
  }

  if (room.status === 'drawing' && prevStatus !== 'drawing') {
    if (prevStatus === 'waiting') {
      enterGame();
    } else {
      handleDrawingStart();
    }
  }

  // 画手设置了题目 → 猜词者开始计时
  if (room.status === 'drawing' && !prevWord && room.current_word && !G.isDrawer) {
    onWordSet();
  }

  updateGameUI();
  updatePlayerList();
}

async function loadPlayers() {
  const { data, error } = await gameDb
    .from('players')
    .select('*')
    .eq('room_id', G.roomId)
    .eq('is_online', true);

  if (!error && data) {
    const prevCount = G.players.length;
    G.players = data;
    updatePlayerList();

    // 仅在有人离开后触发：之前 >=2 人，现在 <=1 人（延迟 5 秒防误判）
    if (prevCount >= 2 && data.length <= 1 && G.roomId && G.gameStatus !== 'ended') {
      G._soloTimer = setTimeout(async () => {
        // 二次确认：5 秒后仍然只有 1 人才解散
        const { data: recheck } = await gameDb.from('players').select('id').eq('room_id', G.roomId).eq('is_online', true);
        if (recheck && recheck.length <= 1) {
          stopTimer();
          if (G._idleInterval) { clearInterval(G._idleInterval); G._idleInterval = null; }
          if (G.isHost) {
            await gameDb.from('rooms').delete().eq('id', G.roomId);
          }
          clearSession();
          showScreen('screen-home');
          showToast('其他玩家已离开，房间已解散');
        }
      }, 5000);
    }
    // 如果玩家又回来了，取消解散
    if (prevCount <= 1 && data.length >= 2 && G._soloTimer) {
      clearTimeout(G._soloTimer);
      G._soloTimer = null;
    }
  }
}

async function loadStrokes() {
  const { data, error } = await gameDb
    .from('strokes')
    .select('*')
    .eq('room_id', G.roomId)
    .order('created_at', { ascending: true });

  if (!error && data) {
    G.strokes = data;
    replayAllStrokes(data);
  }
}

// ============ 游戏事件处理 ============
function handleDrawingStart() {
		if (G._drawingTransitioning) return;
		G._drawingTransitioning = true;
		G.isDrawer = (G.currentDrawerId === G.playerId);
  G.correctGuessers = new Set();
  stopTimer();
  clearCanvasLocal();

  loadStrokesForCurrentRound();

  if (G.isDrawer) {
    // 画手输入题目
    if (!G.currentWord) {
      showWordInputModal();
    } else {
      startRoundTimer();
    }
  }
  // 猜词者等题目设置后才开始计时（由 onWordSet 触发）

  updateGameUI();
		updatePlayerList();
		G._drawingTransitioning = false;
}

// 画手提交题目后调用
async function submitWord() {
  const input = document.getElementById('input-word');
  const word = input.value.trim();
  if (!word) { showToast('请输入题目'); return; }

  hideWordInputModal();

  await gameDb
    .from('rooms')
    .update({ current_word: word })
    .eq('id', G.roomId);

  G.currentWord = word;
  startRoundTimer();
  updateGameUI();
  showToast(`开始画「${word}」`, 2000);
}

// 猜词者收到题目后调用
function onWordSet() {
  startRoundTimer();
  updateGameUI();
}

function showWordInputModal() {
  document.getElementById('input-word').value = '';
  document.getElementById('modal-word-input').classList.add('active');
  setTimeout(() => document.getElementById('input-word').focus(), 200);
}

function hideWordInputModal() {
  document.getElementById('modal-word-input').classList.remove('active');
}

async function loadStrokesForCurrentRound() {
  const { data } = await gameDb
    .from('strokes')
    .select('*')
    .eq('room_id', G.roomId)
    .order('created_at', { ascending: true });

  if (data) {
    G.strokes = data;
    replayAllStrokes(data);
  }
}

async function handleNewStroke(stroke) {
  if (!stroke) return;
  // 不重播自己的笔画（本地已经画了）
  if (stroke.player_id === G.playerId) return;
  G.strokes.push(stroke);
  replayStroke(stroke);
}

function startRoundTimer() {
  let hintShown = false;
  startTimer(G.roundTime, (seconds) => {
    // 10 秒后无人猜对 → 显示字数提示
    if (!hintShown && seconds <= G.roundTime - 10 && G.correctGuessers.size === 0 && G.currentWord) {
      hintShown = true;
      const len = G.currentWord.replace(/\s/g, '').length;
      addSystemMessage(`💡 提示：这个词有 ${len} 个字`, { broadcast: false });
    }
  }, async () => {
    // 时间到
    if (G.isDrawer) {
      await gameDb
        .from('rooms')
        .update({ status: 'round_end' })
        .eq('id', G.roomId);
    }
  });
}

async function handleRoundEnd() {
  stopTimer();
  updateGameUI();
  addSystemMessage(`第 ${G.currentRound} 轮结束！答案是「${G.currentWord}」`, { broadcast: false });

  // 防止重复触发
  if (G._roundTransitioning) return;
  G._roundTransitioning = true;

  // 短暂等待后进入下一轮或结束
  setTimeout(async () => {
    if (G.isHost && G.currentRound >= G.maxRounds) {
      addSystemMessage('游戏结束！正在计算最终得分...');
      await gameDb
        .from('rooms')
        .update({ status: 'ended' })
        .eq('id', G.roomId);
    } else if (G.isHost) {
      addSystemMessage(`准备进入第 ${G.currentRound + 1} 轮...`);
      await advanceToNextRound();
    }
    G._roundTransitioning = false;
  }, 2500);
}

async function advanceToNextRound() {
  const nextDrawer = await pickNextDrawer();

  if (!nextDrawer) return;

  // 清除上一轮的笔画
  G.strokes = [];
  await gameDb.from('strokes').delete().eq('room_id', G.roomId);

  // 不自动选词，让新画手自己输入
  await gameDb
    .from('rooms')
    .update({
      round: G.currentRound + 1,
      drawer_id: nextDrawer.id,
      current_word: null,
      status: 'drawing',
    })
    .eq('id', G.roomId);
}

async function pickNextDrawer() {
  const onlinePlayers = G.players.filter(p => p.is_online);
  if (onlinePlayers.length === 0) return null;

  // 轮流做绘画者
  const currentDrawerIdx = onlinePlayers.findIndex(p => p.id === G.currentDrawerId);
  const nextIdx = (currentDrawerIdx + 1) % onlinePlayers.length;
  return onlinePlayers[nextIdx];
}

async function pickRandomWord() {
  const { data } = await gameDb
    .from('words')
    .select('word');

  if (!data || data.length === 0) return '苹果';
  return data[Math.floor(Math.random() * data.length)].word;
}

function handleBackToLobby() {
  stopTimer();
  hideModal('modal-gameover');
  clearCanvasLocal();
  G.isDrawer = false;
  G.correctGuessers = new Set();
  showScreen('screen-lobby');
  document.getElementById('lobby-code').textContent = G.roomCode;
  loadPlayers();
		if (G._syncInterval) clearInterval(G._syncInterval);
		G._syncInterval = setInterval(() => loadPlayers(), 5000);
  updatePlayerList();
  startIdleTimer();
  addSystemMessage('🔄 准备开始新一轮游戏！');
}

async function handleGameEnd() {
  stopTimer();
  updateGameUI();

  // 重新加载最终得分
  await loadPlayers();

  const sorted = [...G.players].sort((a, b) => b.score - a.score);
  const rankList = document.getElementById('rank-list');
  const medals = ['🥇', '🥈', '🥉'];
  rankList.innerHTML = sorted.map((p, i) => `
    <li class="rank-item">
      <span class="rank-num">${medals[i] || `${i + 1}`}</span>
      <span class="rank-name">${escapeHtml(p.name)}</span>
      <span class="rank-score">${p.score} 分</span>
    </li>
  `).join('');

  document.getElementById('winner-text').textContent =
    sorted.length > 0
      ? `🎉 ${sorted[0].name} 获得了最高分！`
      : '游戏结束，感谢参与！';

  // 非房主隐藏再来一局按钮
  const stayBtn = document.getElementById('btn-stay-room');
  if (stayBtn) {
    stayBtn.style.display = G.isHost ? '' : 'none';
    stayBtn.textContent = '🔄 再来一局';
  }
  showModal('modal-gameover');
}

// ============ 持久化（刷新恢复） ============
function saveSession() {
  const sess = {
    playerId: G.playerId,
    roomId: G.roomId,
    roomCode: G.roomCode,
    playerName: G.playerName,
    isHost: G.isHost,
  };
  localStorage.setItem('dg-session', JSON.stringify(sess));
}

function clearSession() {
  localStorage.removeItem('dg-session');
}

async function restoreSession() {
  const raw = localStorage.getItem('dg-session');
  if (!raw) return false;
  try {
    const sess = JSON.parse(raw);
    if (!sess.playerId || !sess.roomId) return false;

    // 检查玩家是否还在房间里
    const { data: player } = await gameDb
      .from('players')
      .select('*')
      .eq('id', sess.playerId)
      .eq('room_id', sess.roomId)
      .maybeSingle();

    if (!player) { clearSession(); return false; }

    // 检查房间是否还存在
    const { data: room } = await gameDb
      .from('rooms')
      .select('*')
      .eq('id', sess.roomId)
      .maybeSingle();

    if (!room) { clearSession(); return false; }

    // 恢复状态
    G.playerId = sess.playerId;
    G.roomId = sess.roomId;
    G.roomCode = sess.roomCode;
    G.playerName = sess.playerName;
    G.isHost = sess.isHost;
    G.gameStatus = room.status;
    G.currentWord = room.current_word || '';
    G.currentRound = room.round || 1;
    G.maxRounds = room.max_rounds || 3;
    G.roundTime = room.round_seconds || 60;
    G.currentDrawerId = room.drawer_id;
    G.isDrawer = (room.drawer_id === G.playerId);

    // 标记在线
    await gameDb.from('players').update({ is_online: true }).eq('id', G.playerId);

    // 订阅 + 加载玩家
    await subscribeToRoom();
    await loadPlayers();

    if (room.status === 'waiting') {
      showScreen('screen-lobby');
      document.getElementById('lobby-code').textContent = G.roomCode;
      if (G._syncInterval) clearInterval(G._syncInterval);
      G._syncInterval = setInterval(() => loadPlayers(), 5000);
      updatePlayerList();
    } else if (room.status === 'drawing' || room.status === 'guessing') {
      // 游戏中，加载笔画后进入
      showScreen('screen-game');
      setupGameCanvas();
      initChat();
      await loadStrokesForCurrentRound();
      updateGameUI();
      updatePlayerList();

      if (G.isDrawer && !G.currentWord) {
        showWordInputModal();
      } else if (G.currentWord) {
        startRoundTimer();
      }
    } else if (room.status === 'round_end') {
      showScreen('screen-game');
      setupGameCanvas();
      initChat();
      await loadStrokesForCurrentRound();
      updateGameUI();
      updatePlayerList();
      addSystemMessage(`当前轮结束，答案是「${G.currentWord}」`);
    } else if (room.status === 'ended') {
      showScreen('screen-game');
      setupGameCanvas();
      initChat();
      updateGameUI();
      updatePlayerList();
      handleGameEnd(); // 显示排行榜
    }

    return true;
  } catch (e) {
    clearSession();
    return false;
  }
}
async function leaveRoom() {
  stopTimer();
  if (G._idleInterval) { clearInterval(G._idleInterval); G._idleInterval = null; }
  if (G._syncInterval) { clearInterval(G._syncInterval); G._syncInterval = null; }
  if (G._soloTimer) { clearTimeout(G._soloTimer); G._soloTimer = null; }

  // 取消所有订阅
  Object.values(G.channels).forEach(ch => {
    if (ch && typeof ch.unsubscribe === 'function') ch.unsubscribe();
  });
  G.channels = {};

  // 标记玩家离线
  if (G.playerId) {
    await gameDb
      .from('players')
      .update({ is_online: false })
      .eq('id', G.playerId);
  }

  // 如果是房主离开且房间还在等待中，删除房间
  if (G.isHost && G.gameStatus === 'waiting' && G.roomId) {
    await gameDb.from('rooms').delete().eq('id', G.roomId);
  }

  // 重置状态
  G.roomId = null;
  G.roomCode = '';
  G.isHost = false;
  G.isDrawer = false;
  G.gameStatus = 'waiting';
  G.currentWord = '';
  G.players = [];
  G.strokes = [];
  G.correctGuessers = new Set();
  G.currentRound = 1;
  G.currentDrawerId = null;

  clearSession();
}

// ============ 初始化 ============
async function initGame() {
  // 构建画笔颜色按钮
  const colorsGroup = document.getElementById('colors-group');
  G.COLORS.forEach(color => {
    const btn = document.createElement('div');
    btn.className = 'color-btn' + (color === G.brushColor ? ' active' : '');
    btn.style.background = color;
    if (color === '#FFFFFF') btn.style.border = '2px solid #555';
    btn.onclick = () => {
      G.brushColor = color;
      G.isEraser = false;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('btn-eraser').style.background = '';
      updateBrushCursor();
    };
    colorsGroup.appendChild(btn);
  });

  // 构建画笔粗细按钮
  const sizesGroup = document.getElementById('sizes-group');
  G.SIZES.forEach(size => {
    const btn = document.createElement('div');
    btn.className = 'size-btn' + (size === G.brushWidth ? ' active' : '');
    btn.innerHTML = `<div class="size-dot" style="width:${Math.min(size, 14)}px;height:${Math.min(size, 14)}px;"></div>`;
    btn.onclick = () => {
      G.brushWidth = size;
      G.isEraser = false;
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('btn-eraser').style.background = '';
      updateBrushCursor();
    };
    sizesGroup.appendChild(btn);
  });

  // 橡皮擦按钮
  const eraserBtn = document.getElementById('btn-eraser');
  eraserBtn.onclick = () => {
    G.isEraser = !G.isEraser;
    if (G.isEraser) {
      eraserBtn.style.background = 'rgba(255,255,255,0.2)';
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      updateBrushCursor();
    } else {
      eraserBtn.style.background = '';
      updateBrushCursor();
    }
  };

  // 提交题目按钮
  document.getElementById('btn-submit-word').onclick = submitWord;
  document.getElementById('input-word').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitWord();
  });

  // 再来一局按钮
  document.getElementById('btn-stay-room').onclick = async () => {
    if (!G.isHost) {
      showToast('等待房主开始新一局...');
      return;
    }
    hideModal('modal-gameover');
    await gameDb.from('rooms').update({
      status: 'waiting',
      current_word: null,
      drawer_id: null,
      round: 1,
    }).eq('id', G.roomId);
    await gameDb.from('players').update({ score: 0 }).eq('room_id', G.roomId);
  };

  // 退出按钮（游戏中 + 大厅中）
  async function doExit() {
    try { await leaveRoom(); } catch (e) {}
    showScreen('screen-home');
  }
  document.getElementById('btn-exit-game').addEventListener('click', doExit);
  document.getElementById('btn-exit-lobby').addEventListener('click', doExit);

  // 返回首页按钮
  document.getElementById('btn-back-home').onclick = async () => {
    hideModal('modal-gameover');
    await leaveRoom();
    showScreen('screen-home');
  };
}

function updateBrushCursor() {
  // Canvas cursor 更新在 canvas.js 中处理
}
