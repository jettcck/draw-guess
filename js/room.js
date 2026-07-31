// ============================================
// room.js - 房间管理（创建、加入、游戏流程）
// ============================================

// ============ 创建房间 ============
async function createRoom(playerName) {
  if (!playerName.trim()) {
    showToast('请输入你的昵称！');
    return null;
  }

  let code = generateCode();
  let attempts = 0;

  // 尝试生成唯一房间码
  while (attempts < 10) {
    const { data: existing } = await gameDb
      .from('rooms')
      .select('id')
      .eq('code', code)
      .eq('status', 'waiting')
      .maybeSingle();

    if (!existing) break;
    code = generateCode();
    attempts++;
  }

  // 创建房间
  const { data: room, error: roomError } = await gameDb
    .from('rooms')
    .insert({
      code: code,
      status: 'waiting',
      round: 1,
      max_rounds: 3,
      round_seconds: 60,
    })
    .select()
    .single();

  if (roomError || !room) {
    showToast('创建房间失败，请重试');
    console.error('创建房间失败:', roomError);
    return null;
  }

  // 创建玩家（房主）
  const { data: player, error: playerError } = await gameDb
    .from('players')
    .insert({
      room_id: room.id,
      name: playerName.trim(),
      is_host: true,
      is_online: true,
    })
    .select()
    .single();

  if (playerError || !player) {
    // 回滚：删除房间
    await gameDb.from('rooms').delete().eq('id', room.id);
    showToast('加入房间失败，请重试');
    console.error('创建玩家失败:', playerError);
    return null;
  }

  // 设置全局状态
  G.roomId = room.id;
  G.roomCode = room.code;
  G.playerId = player.id;
  G.playerName = player.name;
  G.isHost = true;
  G.gameStatus = 'waiting';
  G.currentRound = 1;
  G.maxRounds = room.max_rounds;

  return { room, player };
}

// ============ 加入房间 ============
async function joinRoom(code, playerName) {
  if (!playerName.trim()) {
    showToast('请输入你的昵称！');
    return null;
  }

  if (!code || code.trim().length < 4) {
    showToast('请输入有效的房间码');
    return null;
  }

  code = code.trim().toUpperCase();

  // 查找房间
  const { data: room, error: roomError } = await gameDb
    .from('rooms')
    .select('*')
    .eq('code', code)
    .in('status', ['waiting', 'drawing', 'guessing'])
    .maybeSingle();

  if (roomError || !room) {
    showToast('房间不存在或已结束');
    return null;
  }

  // 检查是否已在游戏中（不能中途加入正在玩的房间）
  if (room.status !== 'waiting') {
    showToast('游戏已经开始，无法加入');
    return null;
  }

  // 检查昵称是否重复
  const { data: existing } = await gameDb
    .from('players')
    .select('id')
    .eq('room_id', room.id)
    .eq('name', playerName.trim());

  if (existing && existing.length > 0) {
    showToast('该昵称已被使用，请换一个');
    return null;
  }

  // 创建玩家
  const { data: player, error: playerError } = await gameDb
    .from('players')
    .insert({
      room_id: room.id,
      name: playerName.trim(),
      is_host: false,
      is_online: true,
    })
    .select()
    .single();

  if (playerError || !player) {
    showToast('加入房间失败，请重试');
    return null;
  }

  // 设置全局状态
  G.roomId = room.id;
  G.roomCode = room.code;
  G.playerId = player.id;
  G.playerName = player.name;
  G.isHost = false;
  G.gameStatus = room.status;
  G.currentRound = room.round || 1;
  G.maxRounds = room.max_rounds || 3;
  G.currentDrawerId = room.drawer_id;

  return { room, player };
}

// ============ 进入大厅 ============
async function enterLobby() {
  showScreen('screen-lobby');
  document.getElementById('lobby-code').textContent = G.roomCode;

  // 订阅房间数据
  await subscribeToRoom();
  await loadPlayers();

  // 如果是非等待状态（断线重连），直接进入游戏
  if (G.gameStatus !== 'waiting') {
    enterGame();
    return;
  }
}

// ============ 开始游戏 ============
async function startGame() {
  if (!G.isHost) {
    showToast('只有房主可以开始游戏');
    return;
  }

  const onlinePlayers = G.players.filter(p => p.is_online);
  if (onlinePlayers.length < 2) {
    showToast('至少需要2名玩家才能开始游戏');
    return;
  }

  // 随机选择第一个绘画者
  const drawer = onlinePlayers[Math.floor(Math.random() * onlinePlayers.length)];

  // 先不设置题目，让画手自己输入
  const { error } = await gameDb
    .from('rooms')
    .update({
      status: 'drawing',
      drawer_id: drawer.id,
      current_word: null,
      round: 1,
    })
    .eq('id', G.roomId);

  if (error) {
    showToast('开始游戏失败，请重试');
    console.error('开始游戏失败:', error);
    return;
  }

  G.gameStatus = 'drawing';
  G.currentDrawerId = drawer.id;
  G.currentWord = '';
  G.isDrawer = (drawer.id === G.playerId);

  // 直接切换（订阅也会触发，但 enterGame 有防重复保护）
  await enterGame();
}

// ============ 进入游戏 ============
async function enterGame() {
  // 防止重复进入
  const gameScreen = document.getElementById('screen-game');
  if (gameScreen.classList.contains('active')) return;

  // 判断当前玩家是否是绘画者
  G.isDrawer = (G.currentDrawerId === G.playerId);

  showScreen('screen-game');
  setupGameCanvas();
  initChat();

  // 载入已有笔画
  await loadStrokesForCurrentRound();

  // 更新 UI
  updateGameUI();
  updatePlayerList();

  // 只有题目已设置好的情况下才启动计时器
  if ((G.gameStatus === 'drawing' || G.gameStatus === 'guessing') && G.currentWord) {
    startRoundTimer();
  }

  // 显示提示
  if (G.isDrawer) {
    showToast(`请画「${G.currentWord}」`, 3000);
  } else {
    addSystemMessage(`游戏开始！等待 ${getDrawerName()} 开始作画...`);
  }
}

function getDrawerName() {
  const drawer = G.players.find(p => p.id === G.currentDrawerId);
  return drawer ? drawer.name : '绘画者';
}

// ============ 窗口关闭/刷新处理 ============
window.addEventListener('beforeunload', async () => {
  if (G.playerId) {
    // 使用 navigator.sendBeacon 做最后的消息发送
    const data = JSON.stringify({ player_id: G.playerId, is_online: false });
    // 尝试标记离线
    try {
      await gameDb.from('players').update({ is_online: false }).eq('id', G.playerId);
    } catch (e) {
      // 忽略
    }
  }
});
