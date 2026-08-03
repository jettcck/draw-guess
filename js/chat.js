// ============================================
// chat.js - 聊天消息处理
// ============================================

function initChat() {
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');

  // 发送按钮
  btnSend.onclick = () => sendChatMessage();

  // 回车发送
  chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
  };
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  // 禁止在轮次结束或游戏结束后猜词
  if (G.gameStatus === 'round_end' || G.gameStatus === 'ended') { input.value = ''; return; }
  if (!content || !G.roomId || !G.playerId) return;

  // 检查是否是正确答案（且本轮还没猜对过）
  const alreadyCorrect = G.correctGuessers.has(G.playerId);
  const isCorrect = !alreadyCorrect && checkGuess(content);

  const msgData = {
    room_id: G.roomId,
    player_id: G.playerId,
    player_name: G.playerName,
    content: content,
    type: isCorrect ? 'correct_guess' : 'chat',
  };

  const { error } = await gameDb
    .from('messages')
    .insert(msgData);

  if (error) {
    console.error('发送消息失败:', error);
  }

  input.value = '';

  // 如果猜对了，加分（防止重复加分）
  if (isCorrect && !G.isDrawer) {
    G.correctGuessers.add(G.playerId);
    await handleCorrectGuess();
  }
}

function checkGuess(content) {
  if (!G.currentWord || G.isDrawer) return false;
  // 模糊匹配：忽略空格、大小写
  const guess = content.replace(/\s+/g, '').toLowerCase();
  const word = G.currentWord.replace(/\s+/g, '').toLowerCase();
  return guess === word;
}

async function handleCorrectGuess() {
  // 给自己加分
  const currentPlayer = G.players.find(p => p.id === G.playerId);
  if (!currentPlayer) return;

  const newScore = (currentPlayer.score || 0) + 10;

  await gameDb
    .from('players')
    .update({ score: newScore })
    .eq('id', G.playerId);

  // 给绘画者也加分
  if (G.currentDrawerId) {
    const drawer = G.players.find(p => p.id === G.currentDrawerId);
    if (drawer) {
      await gameDb
        .from('players')
        .update({ score: (drawer.score || 0) + 5 })
        .eq('id', G.currentDrawerId);
    }
  }

  // 检查是否所有猜词者都猜对了
  const guessers = G.players.filter(p => p.id !== G.currentDrawerId && p.is_online);
  const allGuessed = guessers.every(p => G.correctGuessers.has(p.id));

  if (allGuessed && guessers.length > 0) {
    // 所有人猜对，立即结束当前回合
    addSystemMessage('所有人都猜对了！本轮提前结束~');
    await gameDb
      .from('rooms')
      .update({ status: 'round_end' })
      .eq('id', G.roomId);
  }
}

function handleNewMessage(msg) {
  if (!msg) return;

  const container = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg ' + (msg.type || 'chat');

  switch (msg.type) {
    case 'system':
      msgEl.textContent = '💡 ' + msg.content;
      break;
    case 'correct_guess':
      msgEl.textContent = `🎉 ${escapeHtml(msg.player_name || '某人')} 猜对了！`;
      break;
    default:
      // 隐藏自己的猜测内容（防止其他猜词者看到）
      if (msg.player_id === G.playerId) {
        msgEl.innerHTML = `<span class="sender">我：</span>${escapeHtml(msg.content)}`;
      } else {
        // 如果是猜词阶段且不算正确答案，显示内容
        msgEl.innerHTML = `<span class="sender">${escapeHtml(msg.player_name || '匿名')}：</span>${escapeHtml(msg.content)}`;
      }
      break;
  }

  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  // 限制消息数量
  while (container.children.length > 200) {
    container.removeChild(container.firstChild);
  }
}

function addSystemMessage(content, opts = {}) {
  const container = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg system';
  msgEl.textContent = '💡 ' + content;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  // broadcast 为 false 时仅本地显示（用于所有客户端同时触发的消息，如提示）
  if (opts.broadcast !== false && G.roomId) {
    gameDb.from('messages').insert({
      room_id: G.roomId,
      player_id: G.playerId,
      player_name: '系统',
      content: content,
      type: 'system',
    }).then(() => {}).catch(() => {});
  }
}

function clearChat() {
  const container = document.getElementById('chat-messages');
  if (container) {
    container.innerHTML = '<div class="chat-msg system">💡 在底部输入你的猜测</div>';
  }
}
