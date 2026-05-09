// ── SUPABASE ─────────────────────────────────────────
const SUPABASE_URL = 'https://gngpqiymvoluijeyrwqd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduZ3BxaXltdm9sdWlqZXlyd3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTE5MDUsImV4cCI6MjA5MzgyNzkwNX0.fgeB2TQmzGzuw5MTzBC9g2yzyMPhzM7mcWWOGM7rkXw';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DB ───────────────────────────────────────────────
const DB = {
  async getPlayers() {
    const { data, error } = await sb.from('players').select('*').order('created_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map(p => ({ id: p.id, name: p.name, createdAt: p.created_at }));
  },

  async addPlayer(name) {
    const { data: dup } = await sb.from('players').select('id').eq('name', name).maybeSingle();
    if (dup) return { error: '이미 등록된 이름입니다.' };
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const { error } = await sb.from('players').insert({ id, name });
    if (error) return { error: '등록 중 오류가 발생했습니다.' };
    return { player: { id, name } };
  },

  async deletePlayer(id) {
    await sb.from('players').delete().eq('id', id);
  },

  async getMatches() {
    const { data, error } = await sb.from('matches').select('*').order('date', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(m => ({
      id: m.id, date: m.date, type: m.type,
      teamA: m.team_a, teamB: m.team_b,
      sets: m.sets, winner: m.winner
    }));
  },

  async addMatch(data) {
    const id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { error } = await sb.from('matches').insert({
      id, date: data.date, type: data.type,
      team_a: data.teamA, team_b: data.teamB,
      sets: data.sets, winner: data.winner
    });
    if (error) { console.error(error); return null; }
    return { id, ...data };
  },

  async deleteMatch(id) {
    await sb.from('matches').delete().eq('id', id);
  }
};

// ── RANKING ENGINE ───────────────────────────────────
const Rankings = {
  getStart(period) {
    if (period === 'all') return null;
    const d = new Date();
    if (period === '1month') d.setMonth(d.getMonth() - 1);
    if (period === '1year') d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  },
  calcWinner(sets) {
    let a = 0, b = 0;
    sets.forEach(s => { if (s.a > s.b) a++; else if (s.b > s.a) b++; });
    return a > b ? 'A' : b > a ? 'B' : null;
  },
  compute(players, matches, period) {
    const start = this.getStart(period);
    const filtered = start ? matches.filter(m => m.date >= start) : matches;
    const stats = {};
    players.forEach(p => { stats[p.id] = { player: p, wins: 0, losses: 0, total: 0 }; });
    filtered.forEach(m => {
      if (!m.winner) return;
      const win = m.winner === 'A' ? m.teamA : m.teamB;
      const lose = m.winner === 'A' ? m.teamB : m.teamA;
      win.forEach(id => { if (stats[id]) { stats[id].wins++; stats[id].total++; } });
      lose.forEach(id => { if (stats[id]) { stats[id].losses++; stats[id].total++; } });
    });
    return Object.values(stats).filter(s => s.total > 0)
      .sort((a, b) => {
        const ra = a.wins / a.total, rb = b.wins / b.total;
        return Math.abs(rb - ra) > 0.0001 ? rb - ra : b.wins - a.wins;
      });
  }
};

// ── HELPERS ──────────────────────────────────────────
const $ = id => document.getElementById(id);
let _cache = []; // player name cache

function playerName(id) {
  const p = _cache.find(p => p.id === id);
  return p ? p.name : '?';
}
const fmt = date => new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
const setDetail = sets => sets.map(s => `${s.a}-${s.b}`).join(' ');
function setCount(sets) {
  let a = 0, b = 0;
  sets.forEach(s => { if (s.a > s.b) a++; else if (s.b > s.a) b++; });
  return { a, b };
}
function toast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function loading(id) {
  const el = $(id);
  if (el) el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3)">⏳ 불러오는 중...</div>';
}

// ── TAB ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('sec-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'rankings') renderRankings();
  if (tab === 'history')  renderHistory();
  if (tab === 'add')      initAddForm();
  if (tab === 'players')  renderPlayers();
}

// ── RANKINGS ─────────────────────────────────────────
let rankPeriod = 'all';

async function renderRankings() {
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === rankPeriod));
  loading('ranking-list');
  const [players, matches] = await Promise.all([DB.getPlayers(), DB.getMatches()]);
  _cache = players;
  const data = Rankings.compute(players, matches, rankPeriod);
  const el = $('ranking-list');
  if (!data.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎾</div><p>아직 경기 기록이 없습니다.</p></div>';
    return;
  }
  el.innerHTML = data.map((s, i) => {
    const rate = Math.round(s.wins / s.total * 100);
    const rc = rate >= 60 ? 'high' : rate >= 40 ? 'mid' : 'low';
    const bc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const barColor = rate >= 60 ? 'var(--primary)' : rate >= 40 ? 'var(--yellow)' : 'var(--danger)';
    return `<div class="rank-card">
      <div class="rank-badge ${bc}">${i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${s.player.name}</div>
        <div class="rank-meta">${s.total}경기 · ${s.wins}승 ${s.losses}패</div>
        <div class="win-bar-wrap"><div class="win-bar" style="width:${rate}%;background:${barColor}"></div></div>
      </div>
      <div class="rank-rate ${rc}">${rate}%</div>
    </div>`;
  }).join('');
}

// ── HISTORY ──────────────────────────────────────────
async function renderHistory() {
  loading('history-list');
  const [players, matches] = await Promise.all([DB.getPlayers(), DB.getMatches()]);
  _cache = players;
  const el = $('history-list');
  if (!matches.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>등록된 경기가 없습니다.</p></div>';
    return;
  }
  const byDate = {};
  matches.forEach(m => { (byDate[m.date] = byDate[m.date] || []).push(m); });
  el.innerHTML = Object.keys(byDate).sort((a,b)=>b.localeCompare(a)).map(date => `
    <div class="date-group">
      <div class="date-label">📅 ${fmt(date)} · ${byDate[date].length}경기</div>
      ${byDate[date].map(matchCard).join('')}
    </div>`).join('');
}

function matchCard(m) {
  const dbl = m.type === 'doubles';
  const cnt = setCount(m.sets || []);
  const aWin = m.winner === 'A', bWin = m.winner === 'B';
  const aN = m.teamA.map(playerName).join(' / ');
  const bN = m.teamB.map(playerName).join(' / ');
  return `<div class="match-card">
    <span class="match-type-badge ${dbl?'doubles':'singles'}">${dbl?'복식':'단식'}</span>
    <div class="match-teams">
      <div class="team-names team-a ${aWin?'winner':'loser'}">${aWin?'🏆 ':''}${aN}</div>
      <div class="score-display">
        <div class="score-sets">${cnt.a} : ${cnt.b}</div>
        <div class="score-detail">${setDetail(m.sets||[])}</div>
      </div>
      <div class="team-names team-b ${bWin?'winner':'loser'}">${bWin?'🏆 ':''}${bN}</div>
    </div>
    <div class="match-actions">
      <button class="btn-delete" onclick="deleteMatch('${m.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

async function deleteMatch(id) {
  if (!confirm('이 경기를 삭제할까요?')) return;
  await DB.deleteMatch(id);
  toast('경기가 삭제되었습니다.');
  renderHistory();
}

// ── ADD MATCH ────────────────────────────────────────
let matchType = 'singles', selectedPlayers = [], sets = [];

async function initAddForm() {
  matchType = 'singles'; selectedPlayers = [];
  sets = [{ a:'', b:'' }, { a:'', b:'' }];
  $('match-date').value = new Date().toISOString().split('T')[0];
  updateTypeUI();
  await renderPlayerPool();
  renderSets();
  renderSelectionDisplay();
}

function setMatchType(type) {
  matchType = type; selectedPlayers = [];
  updateTypeUI(); renderPlayerPool(); renderSelectionDisplay();
}

function updateTypeUI() {
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === matchType));
  $('singles-section').style.display = matchType === 'singles' ? 'block' : 'none';
  $('doubles-section').style.display = matchType === 'doubles' ? 'block' : 'none';
}

async function renderPlayerPool() {
  const players = await DB.getPlayers();
  _cache = players;
  if (matchType === 'singles') {
    const opts = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    $('singles-a').innerHTML = '<option value="">선수 선택</option>' + opts;
    $('singles-b').innerHTML = '<option value="">선수 선택</option>' + opts;
    return;
  }
  if (!players.length) {
    $('player-pool').innerHTML = '<p style="color:var(--text3);font-size:0.85rem">선수를 먼저 등록해주세요.</p>';
    return;
  }
  $('player-pool').innerHTML = players.map(p => {
    const idx = selectedPlayers.indexOf(p.id);
    const cls = idx !== -1 ? (idx < 2 ? 'selected-a' : 'selected-b') : '';
    const num = idx !== -1 ? `<span style="font-size:0.7rem;margin-right:4px;opacity:0.8">${idx+1}</span>` : '';
    return `<button class="player-chip ${cls}" onclick="togglePlayer('${p.id}')">${num}${p.name}</button>`;
  }).join('');
}

function togglePlayer(id) {
  const idx = selectedPlayers.indexOf(id);
  if (idx !== -1) selectedPlayers.splice(idx, 1);
  else {
    if (selectedPlayers.length >= 4) { toast('4명까지 선택 가능합니다.', 'error'); return; }
    selectedPlayers.push(id);
  }
  renderPlayerPool(); renderSelectionDisplay();
}

function renderSelectionDisplay() {
  if (matchType !== 'doubles') return;
  const s = ['','','',''];
  selectedPlayers.forEach((id,i) => { s[i] = playerName(id); });
  const aS = [0,1].map(i=>`<div class="sel-player ${s[i]?'filled a':''}">${s[i]||'선수'+(i+1)}</div>`).join('');
  const bS = [2,3].map(i=>`<div class="sel-player ${s[i]?'filled b':''}">${s[i]||'선수'+(i+1)}</div>`).join('');
  $('sel-display').innerHTML = `
    <div class="sel-team team-a"><div class="sel-label a">A팀</div>${aS}</div>
    <div class="sel-vs">VS</div>
    <div class="sel-team team-b"><div class="sel-label b">B팀</div>${bS}</div>`;
}

function renderSets() {
  $('set-scores').innerHTML = sets.map((s,i) => `
    <div class="set-row">
      <input class="score-input team-a" type="number" min="0" max="99" value="${s.a}" placeholder="0"
        oninput="sets[${i}].a=this.value===''?'':parseInt(this.value)||0">
      <div class="set-dash">${i+1}세트</div>
      <input class="score-input team-b" type="number" min="0" max="99" value="${s.b}" placeholder="0"
        oninput="sets[${i}].b=this.value===''?'':parseInt(this.value)||0">
    </div>`).join('');
}

function addSet() {
  if (sets.length >= 5) { toast('최대 5세트까지 입력 가능합니다.', 'error'); return; }
  sets.push({ a:'', b:'' }); renderSets();
}
function removeSet() { if (sets.length > 1) { sets.pop(); renderSets(); } }

async function submitMatch() {
  const date = $('match-date').value;
  if (!date) { toast('날짜를 선택해주세요.', 'error'); return; }
  let teamA = [], teamB = [];
  if (matchType === 'singles') {
    const a = $('singles-a').value, b = $('singles-b').value;
    if (!a || !b) { toast('선수 두 명을 선택해주세요.', 'error'); return; }
    if (a === b) { toast('같은 선수를 선택했습니다.', 'error'); return; }
    teamA = [a]; teamB = [b];
  } else {
    if (selectedPlayers.length < 4) { toast('4명을 선택해주세요.', 'error'); return; }
    teamA = selectedPlayers.slice(0,2); teamB = selectedPlayers.slice(2,4);
  }
  const finalSets = sets.map(s => ({ a: parseInt(s.a)||0, b: parseInt(s.b)||0 }));
  const winner = Rankings.calcWinner(finalSets);
  if (!winner) { toast('승패를 결정할 수 없습니다. 스코어를 확인해주세요.', 'error'); return; }

  const btn = document.querySelector('[onclick="submitMatch()"]');
  if (btn) { btn.textContent = '⏳ 등록 중...'; btn.disabled = true; }
  const result = await DB.addMatch({ date, type: matchType, teamA, teamB, sets: finalSets, winner });
  if (btn) { btn.textContent = '🎾 경기 등록하기'; btn.disabled = false; }
  if (!result) { toast('등록 중 오류가 발생했습니다.', 'error'); return; }
  toast('경기가 등록되었습니다! 🎾');
  switchTab('history');
}

// ── PLAYERS ──────────────────────────────────────────
async function renderPlayers() {
  loading('player-list');
  const [players, matches] = await Promise.all([DB.getPlayers(), DB.getMatches()]);
  _cache = players;
  const statsMap = {};
  matches.forEach(m => {
    (m.winner==='A'?m.teamA:m.teamB).forEach(id => { statsMap[id]=statsMap[id]||{w:0,l:0}; statsMap[id].w++; });
    (m.winner==='A'?m.teamB:m.teamA).forEach(id => { statsMap[id]=statsMap[id]||{w:0,l:0}; statsMap[id].l++; });
  });
  const el = $('player-list');
  const cnt = $('player-count');
  if (!players.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>등록된 선수가 없습니다.<br>아래에서 선수를 추가해주세요.</p></div>';
    if (cnt) cnt.textContent = '';
    return;
  }
  if (cnt) cnt.textContent = `총 ${players.length}명 등록`;
  el.innerHTML = players.map(p => {
    const s = statsMap[p.id] || {w:0, l:0};
    const total = s.w + s.l;
    const rate = total > 0 ? Math.round(s.w/total*100) : '-';
    return `<div class="player-row">
      <div class="player-avatar">${p.name.charAt(0)}</div>
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="player-stats-mini">${total>0?`${total}경기 · ${s.w}승 ${s.l}패 · 승률 ${rate}%`:'경기 없음'}</div>
      </div>
      <button class="player-del" onclick="deletePlayer('${p.id}')">✕</button>
    </div>`;
  }).join('');
}

async function addPlayer() {
  const input = $('player-name-input');
  const name = input.value.trim();
  if (!name) { toast('이름을 입력해주세요.', 'error'); return; }
  const btn = document.querySelector('[onclick="addPlayer()"]');
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  const result = await DB.addPlayer(name);
  if (btn) { btn.textContent = '등록'; btn.disabled = false; }
  if (result.error) { toast(result.error, 'error'); return; }
  input.value = ''; input.focus();
  toast(`${name} 선수가 등록되었습니다! 👋`);
  renderPlayers();
}

async function deletePlayer(id) {
  const p = _cache.find(x => x.id === id);
  if (!confirm(`${p?.name} 선수를 삭제할까요?\n(관련 경기 기록은 유지됩니다)`)) return;
  await DB.deletePlayer(id);
  toast('선수가 삭제되었습니다.');
  renderPlayers();
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchTab('rankings');
  $('player-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
});
