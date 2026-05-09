// ── DB ──────────────────────────────────────────────
const DB = {
  getPlayers: () => JSON.parse(localStorage.getItem('t_players') || '[]'),
  savePlayers: (d) => localStorage.setItem('t_players', JSON.stringify(d)),
  getMatches: () => JSON.parse(localStorage.getItem('t_matches') || '[]'),
  saveMatches: (d) => localStorage.setItem('t_matches', JSON.stringify(d)),

  addPlayer(name) {
    const list = this.getPlayers();
    if (list.find(p => p.name === name)) return { error: '이미 등록된 이름입니다.' };
    const p = { id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name, createdAt: new Date().toISOString() };
    list.push(p);
    this.savePlayers(list);
    return { player: p };
  },

  deletePlayer(id) {
    this.savePlayers(this.getPlayers().filter(p => p.id !== id));
  },

  addMatch(data) {
    const list = this.getMatches();
    const m = { id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), ...data, createdAt: new Date().toISOString() };
    list.push(m);
    this.saveMatches(list);
    return m;
  },

  deleteMatch(id) {
    this.saveMatches(this.getMatches().filter(m => m.id !== id));
  }
};

// ── RANKING ENGINE ──────────────────────────────────
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

  compute(period) {
    const players = DB.getPlayers();
    const matches = DB.getMatches();
    const start = this.getStart(period);
    const filtered = start ? matches.filter(m => m.date >= start) : matches;

    const stats = {};
    players.forEach(p => { stats[p.id] = { player: p, wins: 0, losses: 0, total: 0 }; });

    filtered.forEach(m => {
      const winner = m.winner;
      if (!winner) return;
      const winTeam = winner === 'A' ? m.teamA : m.teamB;
      const loseTeam = winner === 'A' ? m.teamB : m.teamA;
      winTeam.forEach(id => { if (stats[id]) { stats[id].wins++; stats[id].total++; } });
      loseTeam.forEach(id => { if (stats[id]) { stats[id].losses++; stats[id].total++; } });
    });

    return Object.values(stats)
      .filter(s => s.total > 0)
      .sort((a, b) => {
        const ra = a.wins / a.total, rb = b.wins / b.total;
        if (Math.abs(rb - ra) > 0.0001) return rb - ra;
        return b.wins - a.wins;
      });
  }
};

// ── HELPERS ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = date => {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
};

function toast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function getInitial(name) { return name.charAt(0).toUpperCase(); }

function setScoreSummary(sets) {
  return sets.map(s => `${s.a}-${s.b}`).join(' ');
}

function setCountScore(sets) {
  let a = 0, b = 0;
  sets.forEach(s => { if (s.a > s.b) a++; else if (s.b > s.a) b++; });
  return { a, b };
}

function playerName(id) {
  const p = DB.getPlayers().find(p => p.id === id);
  return p ? p.name : '?';
}

// ── TAB NAVIGATION ──────────────────────────────────
let currentTab = 'rankings';

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('sec-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === 'rankings') renderRankings();
  if (tab === 'history') renderHistory();
  if (tab === 'add') initAddForm();
  if (tab === 'players') renderPlayers();
}

// ── RANKINGS ────────────────────────────────────────
let rankPeriod = 'all';

function renderRankings() {
  const data = Rankings.compute(rankPeriod);
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === rankPeriod));

  const container = $('ranking-list');
  if (data.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎾</div><p>아직 경기 기록이 없습니다.</p></div>`;
    return;
  }

  container.innerHTML = data.map((s, i) => {
    const rate = Math.round(s.wins / s.total * 100);
    const rateClass = rate >= 60 ? 'high' : rate >= 40 ? 'mid' : 'low';
    const badgeClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    return `
    <div class="rank-card">
      <div class="rank-badge ${badgeClass}">${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${s.player.name}</div>
        <div class="rank-meta">${s.total}경기 · ${s.wins}승 ${s.losses}패</div>
        <div class="win-bar-wrap"><div class="win-bar" style="width:${rate}%; background:${rate>=60?'var(--primary)':rate>=40?'var(--yellow)':'var(--danger)'}"></div></div>
      </div>
      <div class="rank-rate ${rateClass}">${rate}%</div>
    </div>`;
  }).join('');
}

// ── HISTORY ─────────────────────────────────────────
function renderHistory() {
  const matches = DB.getMatches();
  const container = $('history-list');

  if (matches.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>등록된 경기가 없습니다.</p></div>`;
    return;
  }

  const byDate = {};
  matches.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  container.innerHTML = dates.map(date => {
    const dayMatches = byDate[date];
    const cards = dayMatches.map(m => matchCard(m)).join('');
    return `<div class="date-group">
      <div class="date-label">📅 ${fmt(date)} · ${dayMatches.length}경기</div>
      ${cards}
    </div>`;
  }).join('');
}

function matchCard(m) {
  const isDoubles = m.type === 'doubles';
  const sets = m.sets || [];
  const cnt = setCountScore(sets);
  const winner = m.winner;

  const teamANames = m.teamA.map(playerName).join(' / ');
  const teamBNames = m.teamB.map(playerName).join(' / ');

  const aWin = winner === 'A', bWin = winner === 'B';
  const scoreStr = `${cnt.a} : ${cnt.b}`;
  const setDetail = setScoreSummary(sets);

  return `<div class="match-card">
    <span class="match-type-badge ${isDoubles ? 'doubles' : 'singles'}">${isDoubles ? '복식' : '단식'}</span>
    <div class="match-teams">
      <div class="team-names team-a ${aWin ? 'winner' : 'loser'}">${aWin ? '🏆 ' : ''}${teamANames}</div>
      <div class="score-display">
        <div class="score-sets">${scoreStr}</div>
        <div class="score-detail">${setDetail}</div>
      </div>
      <div class="team-names team-b ${bWin ? 'winner' : 'loser'}">${bWin ? '🏆 ' : ''}${teamBNames}</div>
    </div>
    <div class="match-actions">
      <button class="btn-delete" onclick="deleteMatch('${m.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

function deleteMatch(id) {
  if (!confirm('이 경기를 삭제할까요?')) return;
  DB.deleteMatch(id);
  toast('경기가 삭제되었습니다.');
  renderHistory();
}

// ── ADD MATCH ────────────────────────────────────────
let matchType = 'singles';
let selectedPlayers = []; // for doubles: up to 4
let sets = [];

function initAddForm() {
  matchType = 'singles';
  selectedPlayers = [];
  sets = [{ a: '', b: '' }, { a: '', b: '' }];

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  $('match-date').value = today;

  updateTypeUI();
  renderPlayerPool();
  renderSets();
  renderSelectionDisplay();
}

function setMatchType(type) {
  matchType = type;
  selectedPlayers = [];
  updateTypeUI();
  renderPlayerPool();
  renderSelectionDisplay();
}

function updateTypeUI() {
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === matchType);
  });
  $('singles-section').style.display = matchType === 'singles' ? 'block' : 'none';
  $('doubles-section').style.display = matchType === 'doubles' ? 'block' : 'none';
}

// ─── Singles ───
function renderSinglesPlayers() {
  const players = DB.getPlayers();
  const opts = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('singles-a').innerHTML = '<option value="">선수 선택</option>' + opts;
  $('singles-b').innerHTML = '<option value="">선수 선택</option>' + opts;
}

// ─── Doubles Player Pool ───
function renderPlayerPool() {
  if (matchType === 'singles') {
    renderSinglesPlayers();
    return;
  }
  const players = DB.getPlayers();
  if (players.length === 0) {
    $('player-pool').innerHTML = '<p style="color:var(--text3);font-size:0.85rem">선수를 먼저 등록해주세요.</p>';
    return;
  }
  $('player-pool').innerHTML = players.map(p => {
    const idx = selectedPlayers.indexOf(p.id);
    const isA = idx === 0 || idx === 1;
    const isB = idx === 2 || idx === 3;
    const cls = idx !== -1 ? (isA ? 'selected-a' : 'selected-b') : '';
    const num = idx !== -1 ? idx + 1 : '';
    return `<button class="player-chip ${cls}" onclick="togglePlayerSelection('${p.id}')" id="chip-${p.id}">
      ${num ? `<span style="font-size:0.7rem;margin-right:4px;opacity:0.8">${num}</span>` : ''}${p.name}
    </button>`;
  }).join('');
}

function togglePlayerSelection(id) {
  const idx = selectedPlayers.indexOf(id);
  if (idx !== -1) {
    selectedPlayers.splice(idx, 1);
  } else {
    if (selectedPlayers.length >= 4) { toast('4명까지 선택 가능합니다.', 'error'); return; }
    selectedPlayers.push(id);
  }
  renderPlayerPool();
  renderSelectionDisplay();
}

function renderSelectionDisplay() {
  if (matchType !== 'doubles') return;
  const slots = ['', '', '', ''];
  selectedPlayers.forEach((id, i) => { slots[i] = playerName(id); });
  const aSlots = [0, 1].map(i => `<div class="sel-player ${slots[i] ? 'filled a' : ''}">${slots[i] || '선수'+(i+1)}</div>`).join('');
  const bSlots = [2, 3].map(i => `<div class="sel-player ${slots[i] ? 'filled b' : ''}">${slots[i] || '선수'+(i+1)}</div>`).join('');
  $('sel-display').innerHTML = `
    <div class="sel-team team-a"><div class="sel-label a">A팀</div>${aSlots}</div>
    <div class="sel-vs">VS</div>
    <div class="sel-team team-b"><div class="sel-label b">B팀</div>${bSlots}</div>`;
}

// ─── Sets ───
function renderSets() {
  $('set-scores').innerHTML = sets.map((s, i) => `
    <div class="set-row">
      <input class="score-input team-a" type="number" min="0" max="99" value="${s.a}" placeholder="0"
        oninput="updateSet(${i},'a',this.value)" id="set-a-${i}">
      <div class="set-dash">${i + 1}세트</div>
      <input class="score-input team-b" type="number" min="0" max="99" value="${s.b}" placeholder="0"
        oninput="updateSet(${i},'b',this.value)" id="set-b-${i}">
    </div>`).join('');
}

function updateSet(i, team, val) {
  sets[i][team] = val === '' ? '' : parseInt(val) || 0;
}

function addSet() {
  if (sets.length >= 5) { toast('최대 5세트까지 입력 가능합니다.', 'error'); return; }
  sets.push({ a: '', b: '' });
  renderSets();
}

function removeSet() {
  if (sets.length <= 1) return;
  sets.pop();
  renderSets();
}

function submitMatch() {
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
    teamA = selectedPlayers.slice(0, 2);
    teamB = selectedPlayers.slice(2, 4);
  }

  const finalSets = sets.map(s => ({ a: parseInt(s.a) || 0, b: parseInt(s.b) || 0 }));
  if (finalSets.length === 0) { toast('세트 스코어를 입력해주세요.', 'error'); return; }

  const winner = Rankings.calcWinner(finalSets);
  if (!winner) { toast('승패를 결정할 수 없습니다. 세트 스코어를 확인해주세요.', 'error'); return; }

  DB.addMatch({ date, type: matchType, teamA, teamB, sets: finalSets, winner });
  toast('경기가 등록되었습니다! 🎾');
  initAddForm();
  switchTab('history');
}

// ── PLAYERS ─────────────────────────────────────────
function renderPlayers() {
  const players = DB.getPlayers();
  const matches = DB.getMatches();

  const statsMap = {};
  matches.forEach(m => {
    const w = m.winner === 'A' ? m.teamA : m.teamB;
    const l = m.winner === 'A' ? m.teamB : m.teamA;
    w.forEach(id => { if (!statsMap[id]) statsMap[id] = {w:0,l:0}; statsMap[id].w++; });
    l.forEach(id => { if (!statsMap[id]) statsMap[id] = {w:0,l:0}; statsMap[id].l++; });
  });

  const container = $('player-list');
  if (players.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>등록된 선수가 없습니다.<br>아래에서 선수를 추가해주세요.</p></div>`;
    return;
  }

  const countEl = $('player-count');
  if (countEl) countEl.textContent = `총 ${players.length}명 등록`;

  container.innerHTML = players.map(p => {
    const s = statsMap[p.id] || { w: 0, l: 0 };
    const total = s.w + s.l;
    const rate = total > 0 ? Math.round(s.w / total * 100) : '-';
    return `<div class="player-row">
      <div class="player-avatar">${getInitial(p.name)}</div>
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="player-stats-mini">${total > 0 ? `${total}경기 · ${s.w}승 ${s.l}패 · 승률 ${rate}%` : '경기 없음'}</div>
      </div>
      <button class="player-del" onclick="deletePlayer('${p.id}')" title="삭제">✕</button>
    </div>`;
  }).join('');
}

function addPlayer() {
  const input = $('player-name-input');
  const name = input.value.trim();
  if (!name) { toast('이름을 입력해주세요.', 'error'); return; }
  const result = DB.addPlayer(name);
  if (result.error) { toast(result.error, 'error'); return; }
  input.value = '';
  input.focus();
  toast(`${name} 선수가 등록되었습니다! 👋`);
  renderPlayers();
}

function resetData() {
  if (!confirm('모든 데이터를 초기화할까요?\n선수, 경기 기록이 모두 삭제됩니다.')) return;
  localStorage.removeItem('t_players');
  localStorage.removeItem('t_matches');
  toast('데이터가 초기화되었습니다.');
  switchTab('rankings');
}

function deletePlayer(id) {
  const p = DB.getPlayers().find(x => x.id === id);
  if (!confirm(`${p?.name} 선수를 삭제할까요?\n(관련 경기 기록은 유지됩니다)`)) return;
  DB.deletePlayer(id);
  toast('선수가 삭제되었습니다.');
  renderPlayers();
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchTab('rankings');

  $('player-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });

  // Demo data — 고유 ID를 직접 지정하여 충돌 방지
  if (DB.getPlayers().length === 0) {
    const demoPlayers = [
      { id:'p_d1', name:'김철수', createdAt:new Date().toISOString() },
      { id:'p_d2', name:'이영희', createdAt:new Date().toISOString() },
      { id:'p_d3', name:'박민준', createdAt:new Date().toISOString() },
      { id:'p_d4', name:'최지현', createdAt:new Date().toISOString() },
      { id:'p_d5', name:'정우성', createdAt:new Date().toISOString() },
      { id:'p_d6', name:'한소희', createdAt:new Date().toISOString() },
    ];
    DB.savePlayers(demoPlayers);
    const [p1,p2,p3,p4,p5,p6] = demoPlayers.map(p => p.id);

    const today = new Date().toISOString().split('T')[0];
    const d1 = new Date(Date.now()-86400000).toISOString().split('T')[0];
    const d2 = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
    const d3 = new Date(Date.now()-14*86400000).toISOString().split('T')[0];
    const demoMatches = [
      { id:'m_d1', date:today, type:'singles',  teamA:[p1],    teamB:[p2],    sets:[{a:6,b:4},{a:6,b:3}],        winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d2', date:today, type:'doubles',  teamA:[p1,p3], teamB:[p2,p4], sets:[{a:6,b:7},{a:6,b:4},{a:7,b:5}], winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d3', date:d1,    type:'doubles',  teamA:[p5,p1], teamB:[p3,p6], sets:[{a:6,b:3},{a:6,b:4}],        winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d4', date:d1,    type:'singles',  teamA:[p2],    teamB:[p4],    sets:[{a:6,b:2},{a:6,b:4}],        winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d5', date:d2,    type:'doubles',  teamA:[p4,p6], teamB:[p1,p5], sets:[{a:6,b:4},{a:7,b:6}],        winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d6', date:d2,    type:'singles',  teamA:[p3],    teamB:[p2],    sets:[{a:6,b:3},{a:6,b:4}],        winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d7', date:d3,    type:'doubles',  teamA:[p2,p5], teamB:[p3,p4], sets:[{a:6,b:4},{a:3,b:6},{a:6,b:4}], winner:'A', createdAt:new Date().toISOString() },
      { id:'m_d8', date:d3,    type:'singles',  teamA:[p6],    teamB:[p1],    sets:[{a:6,b:7},{a:6,b:3},{a:6,b:4}], winner:'A', createdAt:new Date().toISOString() },
    ];
    DB.saveMatches(demoMatches);
  }
});
