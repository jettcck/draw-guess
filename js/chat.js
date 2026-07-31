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
  if (!content || !G.roomId || !G.playerId) return;

  // 检查是否是正确答案
  const isCorrect = checkGuess(content);

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

  // 如果猜对了，加分
  if (isCorrect && !G.isDrawer) {
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

  // 检查是否所有人都猜对了
  const guessers = G.players.filter(p => p.id !== G.currentDrawerId && p.is_online);
  // 如果超过一半的人猜对了，进入下一轮
  // 简化处理：不自动进入下一轮，等时间到
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
      msgEl.textContent = `🎉 ${escapeHtml(msg.player_name || '某人')} 猜对了！答案是「${G.currentWord || msg.content}」`;
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

function addSystemMessage(content) {
  const container = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg system';
  msgEl.textContent = '💡 ' + content;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  // 也可以发送到服务器（让其他玩家看到）
  if (G.roomId) {
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
