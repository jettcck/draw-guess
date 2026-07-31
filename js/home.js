// ============================================
// home.js - 首页交互逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  initGame();
  initHome();

  // 刷新后自动恢复房间
  const restored = await restoreSession();
  if (restored) {
    showToast('已重新连接房间', 2000);
  }
});

function initHome() {
  const inputName = document.getElementById('input-name');
  const inputCode = document.getElementById('input-code');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');

  // 回车键快捷操作
  inputName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (inputCode.value.trim()) {
        handleJoin();
      } else {
        handleCreate();
      }
    }
  });

  inputCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  });

  // 房间码自动转大写
  inputCode.addEventListener('input', () => {
    inputCode.value = inputCode.value.toUpperCase();
    // 过滤非法字符
    inputCode.value = inputCode.value.replace(/[^A-Z0-9]/g, '');
  });

  // 创建房间按钮
  btnCreate.addEventListener('click', handleCreate);

  // 加入房间按钮
  btnJoin.addEventListener('click', handleJoin);

  // 开始游戏按钮（大厅中）
  document.getElementById('btn-start').addEventListener('click', startGame);

  // 保存昵称到 localStorage
  const savedName = localStorage.getItem('dg-player-name');
  if (savedName) {
    inputName.value = savedName;
  }
}

async function handleCreate() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) {
    showToast('请输入你的昵称！');
    return;
  }

  // 保存昵称
  localStorage.setItem('dg-player-name', name);

  // 禁用按钮防止重复点击
  const btnCreate = document.getElementById('btn-create');
  btnCreate.disabled = true;
  btnCreate.textContent = '创建中...';

  const result = await createRoom(name);

  btnCreate.disabled = false;
  btnCreate.textContent = '✨ 创建新房间';

  if (result) {
    showToast(`房间创建成功！房间码：${G.roomCode}`);
    await enterLobby();
  }
}

async function handleJoin() {
  const name = document.getElementById('input-name').value.trim();
  const code = document.getElementById('input-code').value.trim();

  if (!name) {
    showToast('请输入你的昵称！');
    return;
  }

  if (!code || code.length < 4) {
    showToast('请输入有效的房间码');
    return;
  }

  // 保存昵称
  localStorage.setItem('dg-player-name', name);

  // 禁用按钮
  const btnJoin = document.getElementById('btn-join');
  btnJoin.disabled = true;
  btnJoin.textContent = '加入中...';

  const result = await joinRoom(code, name);

  btnJoin.disabled = false;
  btnJoin.textContent = '🚪 加入房间';

  if (result) {
    await enterLobby();
  }
}
