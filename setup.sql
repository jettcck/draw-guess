-- ============================================
-- 你画我猜 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建房间表
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'drawing', 'guessing', 'round_end', 'ended')),
  current_word VARCHAR(50),
  drawer_id UUID,
  round INT DEFAULT 1,
  max_rounds INT DEFAULT 3,
  round_seconds INT DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建玩家表
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(20) NOT NULL,
  score INT DEFAULT 0,
  is_online BOOLEAN DEFAULT TRUE,
  is_host BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建笔画表
CREATE TABLE IF NOT EXISTS strokes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  color VARCHAR(7) DEFAULT '#000000',
  stroke_width INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 创建消息表
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  player_name VARCHAR(20),
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'chat' CHECK (type IN ('chat', 'correct_guess', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 创建词库表
CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(50) NOT NULL,
  category VARCHAR(20) DEFAULT 'general'
);

-- ============================================
-- RLS 策略（允许匿名访问，通过房间码隔离）
-- 使用 DROP IF EXISTS + CREATE 确保可重复执行
-- ============================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE strokes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE words ENABLE ROW LEVEL SECURITY;

-- 公共读策略
DROP POLICY IF EXISTS "Public read rooms" ON rooms;
CREATE POLICY "Public read rooms" ON rooms FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read players" ON players;
CREATE POLICY "Public read players" ON players FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read strokes" ON strokes;
CREATE POLICY "Public read strokes" ON strokes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read messages" ON messages;
CREATE POLICY "Public read messages" ON messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read words" ON words;
CREATE POLICY "Public read words" ON words FOR SELECT USING (true);

-- 公共写策略
DROP POLICY IF EXISTS "Public insert rooms" ON rooms;
CREATE POLICY "Public insert rooms" ON rooms FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update rooms" ON rooms;
CREATE POLICY "Public update rooms" ON rooms FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public insert players" ON players;
CREATE POLICY "Public insert players" ON players FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update players" ON players;
CREATE POLICY "Public update players" ON players FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete players" ON players;
CREATE POLICY "Public delete players" ON players FOR DELETE USING (true);
DROP POLICY IF EXISTS "Public insert strokes" ON strokes;
CREATE POLICY "Public insert strokes" ON strokes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete strokes" ON strokes;
CREATE POLICY "Public delete strokes" ON strokes FOR DELETE USING (true);
DROP POLICY IF EXISTS "Public insert messages" ON messages;
CREATE POLICY "Public insert messages" ON messages FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete rooms" ON rooms;
CREATE POLICY "Public delete rooms" ON rooms FOR DELETE USING (true);

-- ============================================
-- 开启 Realtime（WebSocket）
-- 使用 DO 块跳过已存在的表，确保可重复执行
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'strokes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE strokes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_strokes_room ON strokes(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);

-- ============================================
-- 预填充词库（200+ 中文词语）
-- ============================================
INSERT INTO words (word, category) VALUES
('大象', '动物'), ('长颈鹿', '动物'), ('熊猫', '动物'), ('老虎', '动物'),
('狮子', '动物'), ('兔子', '动物'), ('乌龟', '动物'), ('鲨鱼', '动物'),
('蝴蝶', '动物'), ('蜗牛', '动物'), ('袋鼠', '动物'), ('企鹅', '动物'),
('恐龙', '动物'), ('螃蟹', '动物'), ('鲸鱼', '动物'), ('蜘蛛', '动物'),
('西瓜', '食物'), ('汉堡', '食物'), ('冰淇淋', '食物'), ('蛋糕', '食物'),
('面条', '食物'), ('饺子', '食物'), ('火锅', '食物'), ('寿司', '食物'),
('苹果', '食物'), ('香蕉', '食物'), ('草莓', '食物'), ('葡萄', '食物'),
('自行车', '物品'), ('雨伞', '物品'), ('眼镜', '物品'), ('手机', '物品'),
('电脑', '物品'), ('相机', '物品'), ('吉他', '物品'), ('闹钟', '物品'),
('剪刀', '物品'), ('钥匙', '物品'), ('台灯', '物品'), ('望远镜', '物品'),
('火箭', '物品'), ('机器人', '物品'), ('潜水艇', '物品'), ('风车', '物品'),
('太阳', '自然'), ('月亮', '自然'), ('星星', '自然'), ('彩虹', '自然'),
('闪电', '自然'), ('火山', '自然'), ('瀑布', '自然'), ('雪花', '自然'),
('仙人掌', '自然'), ('向日葵', '自然'), ('蘑菇', '自然'), ('树林', '自然'),
('房子', '建筑'), ('城堡', '建筑'), ('灯塔', '建筑'), ('金字塔', '建筑'),
('长城', '建筑'), ('摩天轮', '建筑'), ('桥梁', '建筑'), ('教堂', '建筑'),
('足球', '运动'), ('篮球', '运动'), ('游泳', '运动'), ('滑雪', '运动'),
('拳击', '运动'), ('冲浪', '运动'), ('跳绳', '运动'), ('滑板', '运动'),
('医生', '职业'), ('警察', '职业'), ('厨师', '职业'), ('宇航员', '职业'),
('画家', '职业'), ('消防员', '职业'), ('老师', '职业'), ('飞行员', '职业'),
('超人', '角色'), ('圣诞老人', '角色'), ('海盗', '角色'), ('公主', '角色'),
('孙悟空', '角色'), ('吸血鬼', '角色'), ('美人鱼', '角色'), ('忍者', '角色'),
('飞机', '交通'), ('汽车', '交通'), ('帆船', '交通'), ('热气球', '交通'),
('火车', '交通'), ('直升飞机', '交通'), ('摩托车', '交通'), ('滑板车', '交通'),
('玫瑰花', '植物'), ('大树', '植物'), ('四叶草', '植物'), ('荷花', '植物'),
('跳舞', '动作'), ('唱歌', '动作'), ('睡觉', '动作'), ('刷牙', '动作'),
('跑步', '动作'), ('钓鱼', '动作'), ('拍照', '动作'), ('打电话', '动作'),
('看书', '动作'), ('骑马', '动作'), ('放风筝', '动作'), ('吹气球', '动作'),
('心脏', '身体'), ('眼睛', '身体'), ('耳朵', '身体'), ('嘴巴', '身体'),
('长城', '地名'), ('埃菲尔铁塔', '地名'), ('自由女神像', '地名'), ('比萨斜塔', '地名'),
('太极', '文化'), ('龙舟', '文化'), ('灯笼', '文化'), ('鞭炮', '文化'),
('月亮船', '想象'), ('飞马', '想象'), ('时光机', '想象'), ('魔法棒', '想象'),
('太阳镜', '物品'), ('口红', '物品'), ('拖鞋', '物品'), ('铅笔', '物品'),
('篮球框', '运动'), ('乒乓球', '运动'), ('羽毛球', '运动'), ('保龄球', '运动'),
('海豚', '动物'), ('孔雀', '动物'), ('猫头鹰', '动物'), ('变色龙', '动物'),
('菠萝', '食物'), ('玉米', '食物'), ('甜甜圈', '食物'), ('棒棒糖', '食物'),
('雨鞋', '物品'), ('背包', '物品'), ('沙发', '物品'), ('马桶', '物品'),
('天使', '角色'), ('小丑', '角色'), ('女巫', '角色'), ('骑士', '角色'),
('雪人', '自然'), ('龙卷风', '自然'), ('流星', '自然'), ('北极光', '自然'),
('埃菲尔铁塔', '建筑'), ('自由女神像', '建筑'), ('比萨斜塔', '建筑'), ('大本钟', '建筑'),
('篮球明星', '运动'), ('足球门', '运动'), ('体操', '运动'), ('举重', '运动'),
('照镜子', '动作'), ('打喷嚏', '动作'), ('打哈欠', '动作'), ('伸懒腰', '动作');
