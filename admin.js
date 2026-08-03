// ============================================
// admin.js - 后台管理逻辑
// ============================================

const ADMIN_PASSWORD = 'admin123';
let autoRefreshTimer = null;
let currentTab = 'overview';

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('admin-auth') === '1') {
    showDashboard();
  }

  // 登录按钮
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('admin-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  // 退出按钮
  document.getElementById('btn-logout').addEventListener('click', doLogout);

  // 刷新按钮
  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadAll();
  });

  // Tab 切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
});

// ========== 登录 ==========
function doLogin() {
  const pwd = document.getElementById('admin-password').value;
  if (pwd === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin-auth', '1');
    document.getElementById('admin-password').value = '';
    document.getElementById('login-error').style.display = 'none';
    showDashboard();
  } else {
    document.getElementById('login-error').style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('admin-auth');
  clearInterval(autoRefreshTimer);
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard').style.display = 'flex';
  updateClock();
  setInterval(updateClock, 1000);
  loadAll();
  startAutoRefresh();
}

function updateClock() {
  const now = new Date();
  document.getElementById('current-time').textContent =
    now.toLocaleString('zh-CN', { hour12: false });
}

// ========== Tab 切换 ==========
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  loadAll();
}

// ========== 数据加载 ==========
function loadAll() {
  if (currentTab === 'overview') loadStats();
  if (currentTab === 'wordlogs') loadWordLogs();
  if (currentTab === 'rooms') loadRooms();
}

function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (currentTab === 'overview') loadStats();
    if (currentTab === 'wordlogs') loadWordLogs();
    if (currentTab === 'rooms') loadRooms();
  }, 10000);
}

// ========== 统计概览 ==========
async function loadStats() {
  const today = new Date().toISOString().split('T')[0];

  // 今日房间数
  const { count: roomsToday } = await gameDb
    .from('rooms')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today);
  document.getElementById('stat-rooms-today').textContent = roomsToday ?? '-';

  // 活跃房间（非 ended）
  const { count: activeRooms } = await gameDb
    .from('rooms')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'ended');
  document.getElementById('stat-active-rooms').textContent = activeRooms ?? '-';

  // 今日玩家数
  const { count: playersToday } = await gameDb
    .from('players')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today);
  document.getElementById('stat-players-today').textContent = playersToday ?? '-';

  // 今日题目数
  const { count: wordsToday } = await gameDb
    .from('word_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today);
  document.getElementById('stat-words-today').textContent = wordsToday ?? '-';
}

// ========== 题目日志 ==========
async function loadWordLogs() {
  const { data, error, count } = await gameDb
    .from('word_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200);

  document.getElementById('wordlog-count').textContent = count ?? 0;

  const tbody = document.getElementById('wordlog-tbody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无记录 — 画手提交题目后自动出现</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(log => `
    <tr>
      <td>${formatTime(log.created_at)}</td>
      <td><strong>${escapeHtml(log.room_code || '-')}</strong></td>
      <td>${escapeHtml(log.player_name || '未知')}</td>
      <td><span style="color:var(--primary);font-weight:700;">${escapeHtml(log.word)}</span></td>
      <td>第 ${log.round ?? '?'} 轮</td>
    </tr>
  `).join('');
}

// ========== 房间列表 ==========
async function loadRooms() {
  const { data: rooms, error, count } = await gameDb
    .from('rooms')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  document.getElementById('room-count').textContent = count ?? 0;

  const tbody = document.getElementById('room-tbody');
  if (!rooms || rooms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无房间</td></tr>';
    return;
  }

  // 批量获取每个房间的玩家数
  const roomIds = rooms.map(r => r.id);
  const playerCounts = {};
  if (roomIds.length > 0) {
    // 逐个查询（Supabase 不支持 GROUP BY）
    for (const r of rooms) {
      const { data: players } = await gameDb
        .from('players')
        .select('id, is_online')
        .eq('room_id', r.id);
      if (players) {
        playerCounts[r.id] = {
          online: players.filter(p => p.is_online).length,
          total: players.length
        };
      } else {
        playerCounts[r.id] = { online: 0, total: 0 };
      }
    }
  }

  tbody.innerHTML = rooms.map(room => {
    const pc = playerCounts[room.id] || { online: 0, total: 0 };
    return `
      <tr>
        <td><strong>${escapeHtml(room.code)}</strong></td>
        <td><span class="status-badge ${room.status}">${formatStatus(room.status)}</span></td>
        <td>${room.round}/${room.max_rounds}</td>
        <td>${pc.online}/${pc.total}</td>
        <td>${formatTime(room.created_at)}</td>
      </tr>
    `;
  }).join('');
}

// ========== 工具函数 ==========
function formatStatus(status) {
  const map = {
    'waiting': '等待中',
    'drawing': '绘画中',
    'guessing': '猜词中',
    'round_end': '轮次结算',
    'ended': '已结束'
  };
  return map[status] || status;
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
