// ============================================
// Supabase 配置
// ============================================

const SUPABASE_URL = 'https://fbkguoqwpfudqpmmwebi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GKe11Lr2kBJYy6DD1E1Emg_rTw4Ine9';

// 初始化 Supabase 客户端（使用 gameDb 避免命名冲突）
var gameDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
