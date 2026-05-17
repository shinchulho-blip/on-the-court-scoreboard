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
  },

  async getPhotos() {
    const { data, error } = await sb.from('photos').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  },

  async addPhoto({ date, url, path }) {
    const id = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { error } = await sb.from('photos').insert({ id, date, url, path });
    if (error) { console.error(error); return null; }
    return { id, date, url, path };
  },

  async deletePhoto(id, path) {
    await sb.storage.from('photos').remove([path]);
    await sb.from('photos').delete().eq('id', id);
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
    return a > b ? 'A' : b > a ? 'B' : 'draw';
  },
  compute(players, matches, period) {
    const start = this.getStart(period);
    const filtered = start ? matches.filter(m => m.date >= start) : matches;
    const stats = {};
    players.forEach(p => { stats[p.id] = { player: p, wins: 0, losses: 0, draws: 0, total: 0 }; });
    filtered.forEach(m => {
      if (!m.winner) return;
      if (m.winner === 'draw') {
        [...m.teamA, ...m.teamB].forEach(id => { if (stats[id]) { stats[id].draws++; stats[id].total++; } });
      } else {
        const win = m.winner === 'A' ? m.teamA : m.teamB;
        const lose = m.winner === 'A' ? m.teamB : m.teamA;
        win.forEach(id => { if (stats[id]) { stats[id].wins++; stats[id].total++; } });
        lose.forEach(id => { if (stats[id]) { stats[id].losses++; stats[id].total++; } });
      }
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
  if (tab === 'photos')   initPhotosTab();
}

// ── RANKINGS ─────────────────────────────────────────
let rankPeriod = 'all';
let rankSort = 'wins'; // 'wins' | 'total' | 'rate'

function sortData(data) {
  if (rankSort === 'wins')  return [...data].sort((a, b) => b.wins - a.wins  || b.total - a.total);
  if (rankSort === 'total') return [...data].sort((a, b) => b.total - a.total || b.wins - a.wins);
  if (rankSort === 'rate')  return [...data].sort((a, b) => {
    const ra = a.wins / a.total, rb = b.wins / b.total;
    return Math.abs(rb - ra) > 0.0001 ? rb - ra : b.wins - a.wins;
  });
  return data;
}

async function renderRankings() {
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === rankPeriod));
  document.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === rankSort));
  loading('ranking-list');
  const [players, matches] = await Promise.all([DB.getPlayers(), DB.getMatches()]);
  _cache = players;
  const raw  = Rankings.compute(players, matches, rankPeriod);
  const data = sortData(raw);
  const el = $('ranking-list');
  if (!data.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎾</div><p>아직 경기 기록이 없습니다.</p></div>';
    return;
  }
  const sortLabel = rankSort === 'wins' ? '승' : rankSort === 'total' ? '경기' : '승률';
  el.innerHTML = data.map((s, i) => {
    const rate = Math.round(s.wins / s.total * 100);
    const rc = rate >= 60 ? 'high' : rate >= 40 ? 'mid' : 'low';
    const bc = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const barColor = rate >= 60 ? 'var(--primary)' : rate >= 40 ? 'var(--yellow)' : 'var(--danger)';
    const drawTxt = s.draws > 0 ? ` ${s.draws}무` : '';
    const highlight = rankSort === 'wins'  ? `<span class="rank-highlight">${s.wins}승</span>` :
                      rankSort === 'total' ? `<span class="rank-highlight">${s.total}경기</span>` :
                                            `<span class="rank-highlight rank-rate-sm ${rc}">${rate}%</span>`;
    return `<div class="rank-card">
      <div class="rank-badge ${bc}">${i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${s.player.name} ${highlight}</div>
        <div class="rank-meta">${s.total}경기 · ${s.wins}승 ${s.losses}패${drawTxt} · 승률 ${rate}%</div>
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
  const isDraw = m.winner === 'draw';
  const aWin = m.winner === 'A', bWin = m.winner === 'B';
  const aN = m.teamA.map(playerName).join(' / ');
  const bN = m.teamB.map(playerName).join(' / ');
  const aClass = isDraw ? 'draw' : aWin ? 'winner' : 'loser';
  const bClass = isDraw ? 'draw' : bWin ? 'winner' : 'loser';
  const aPrefix = aWin ? '🏆 ' : isDraw ? '🤝 ' : '';
  const bPrefix = bWin ? '🏆 ' : isDraw ? '🤝 ' : '';
  return `<div class="match-card">
    <span class="match-type-badge ${dbl?'doubles':'singles'}">${dbl?'복식':'단식'}</span>
    <div class="match-teams">
      <div class="team-names team-a ${aClass}">${aPrefix}${aN}</div>
      <div class="score-display">
        <div class="score-sets ${isDraw?'draw-score':''}"
        >${cnt.a} : ${cnt.b}${isDraw?' 🤝':''}</div>
        <div class="score-detail">${setDetail(m.sets||[])}</div>
      </div>
      <div class="team-names team-b ${bClass}">${bPrefix}${bN}</div>
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
  sets = [{ a: 0, b: 0 }, { a: 0, b: 0 }];
  const _today = new Date();
  const _yyyy = _today.getFullYear();
  const _mm = String(_today.getMonth() + 1).padStart(2, '0');
  const _dd = String(_today.getDate()).padStart(2, '0');
  $('match-date').value = `${_yyyy}-${_mm}-${_dd}`;
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

const SCORE_STEPS = [0, 15, 30, 40, 50];

function nextScore(current) {
  const cur = parseInt(current) || 0;
  const idx = SCORE_STEPS.indexOf(cur);
  return idx === -1 || idx === SCORE_STEPS.length - 1 ? 0 : SCORE_STEPS[idx + 1];
}

function cycleScore(setIdx, team) {
  sets[setIdx][team] = nextScore(sets[setIdx][team]);
  renderSets();
}

function renderSets() {
  $('set-scores').innerHTML = sets.map((s, i) => {
    const aVal = parseInt(s.a) || 0;
    const bVal = parseInt(s.b) || 0;
    const aIdx = SCORE_STEPS.indexOf(aVal);
    const bIdx = SCORE_STEPS.indexOf(bVal);
    const aPct = aIdx === -1 ? 0 : Math.round(aIdx / (SCORE_STEPS.length - 1) * 100);
    const bPct = bIdx === -1 ? 0 : Math.round(bIdx / (SCORE_STEPS.length - 1) * 100);
    return `
    <div class="set-row">
      <button class="score-btn team-a" onclick="cycleScore(${i},'a')">
        <span class="score-btn-val">${aVal}</span>
        <div class="score-btn-bar"><div class="score-btn-fill a" style="width:${aPct}%"></div></div>
      </button>
      <div class="set-dash">${i+1}세트</div>
      <button class="score-btn team-b" onclick="cycleScore(${i},'b')">
        <span class="score-btn-val">${bVal}</span>
        <div class="score-btn-bar"><div class="score-btn-fill b" style="width:${bPct}%"></div></div>
      </button>
    </div>`;
  }).join('');
}

function addSet() {
  if (sets.length >= 12) { toast('최대 12세트까지 입력 가능합니다.', 'error'); return; }
  sets.push({ a: 0, b: 0 }); renderSets();
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
  const finalSets = sets.map(s => ({ a: typeof s.a === 'number' ? s.a : parseInt(s.a)||0, b: typeof s.b === 'number' ? s.b : parseInt(s.b)||0 }));
  const winner = Rankings.calcWinner(finalSets);

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

// ── PHOTOS ───────────────────────────────────────────
let _pendingFiles = []; // 업로드 대기 File 객체
let _lightboxPhotos = [], _lightboxIdx = 0;

// 이미지 압축: 최대 1080px, JPEG 품질 0.75 → 모바일 쾌적 수준의 최소 크기
function compressImage(file) {
  return new Promise((resolve) => {
    const MAX = 1080, QUALITY = 0.75;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', QUALITY);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function initPhotosTab() {
  cancelPhotoUpload();
  renderPhotoGallery();
}

function handlePhotoSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  _pendingFiles.push(...files);
  e.target.value = '';
  $('photo-upload-area').style.display = 'none';
  $('photo-preview-section').style.display = 'block';
  // 날짜 기본값: 로컬 오늘
  if (!$('photo-date').value) {
    const t = new Date();
    const y = t.getFullYear(), m = String(t.getMonth()+1).padStart(2,'0'), d = String(t.getDate()).padStart(2,'0');
    $('photo-date').value = `${y}-${m}-${d}`;
  }
  renderPhotoPreview();
}

function renderPhotoPreview() {
  $('photo-preview-grid').innerHTML = _pendingFiles.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div class="photo-preview-item">
      <img src="${url}" loading="lazy">
      <button class="photo-preview-remove" onclick="removePending(${i})">✕</button>
    </div>`;
  }).join('');
}

function removePending(i) {
  _pendingFiles.splice(i, 1);
  if (!_pendingFiles.length) { cancelPhotoUpload(); return; }
  renderPhotoPreview();
}

function cancelPhotoUpload() {
  _pendingFiles = [];
  $('photo-upload-area').style.display = 'block';
  $('photo-preview-section').style.display = 'none';
  $('photo-preview-grid').innerHTML = '';
  $('photo-date').value = '';
}

async function uploadPhotos() {
  const date = $('photo-date').value;
  if (!date) { toast('날짜를 선택해주세요.', 'error'); return; }
  if (!_pendingFiles.length) { toast('사진을 선택해주세요.', 'error'); return; }
  const btn = $('photo-upload-btn');
  btn.textContent = '⏳ 업로드 중...'; btn.disabled = true;
  let ok = 0;
  for (const file of _pendingFiles) {
    const blob = await compressImage(file);
    const path = `${date}/${Date.now()}_${Math.random().toString(36).slice(2,6)}.jpg`;
    const { error: upErr } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (upErr) { console.error(upErr); continue; }
    const { data: { publicUrl } } = sb.storage.from('photos').getPublicUrl(path);
    const res = await DB.addPhoto({ date, url: publicUrl, path });
    if (res) ok++;
  }
  btn.textContent = '📤 올리기'; btn.disabled = false;
  if (ok > 0) {
    toast(`${ok}장 업로드 완료! 📸`);
    cancelPhotoUpload();
    renderPhotoGallery();
  } else {
    toast('업로드 실패. Supabase 설정을 확인해주세요.', 'error');
  }
}

async function renderPhotoGallery() {
  const el = $('photo-gallery');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">⏳ 불러오는 중...</div>';
  const photos = await DB.getPhotos();
  if (!photos.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📷</div><p>아직 사진이 없습니다.<br>첫 번째 사진을 올려보세요!</p></div>';
    return;
  }
  const byDate = {};
  photos.forEach(p => { (byDate[p.date] = byDate[p.date] || []).push(p); });
  _lightboxPhotos = photos;
  el.innerHTML = Object.keys(byDate).sort((a,b) => b.localeCompare(a)).map(date => `
    <div class="photo-date-group">
      <div class="photo-date-label">📅 ${fmt(date)} · ${byDate[date].length}장</div>
      <div class="photo-grid">
        ${byDate[date].map(p => {
          const idx = _lightboxPhotos.findIndex(x => x.id === p.id);
          return `<div class="photo-thumb" onclick="openLightbox(${idx})">
            <img src="${p.url}" loading="lazy">
            <button class="photo-thumb-del" onclick="event.stopPropagation();deletePhoto('${p.id}','${p.path}')">🗑</button>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

async function deletePhoto(id, path) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  await DB.deletePhoto(id, path);
  toast('사진이 삭제되었습니다.');
  renderPhotoGallery();
}

function openLightbox(idx) {
  _lightboxIdx = idx;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.id = 'lightbox';
  lb.innerHTML = `
    <button class="lightbox-close" onclick="closeLightbox()">✕</button>
    <button class="lightbox-prev" onclick="moveLightbox(-1)">‹</button>
    <img class="lightbox-img" id="lightbox-img" src="${_lightboxPhotos[idx].url}">
    <button class="lightbox-next" onclick="moveLightbox(1)">›</button>`;
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  document.body.appendChild(lb);
}
function closeLightbox() { const lb = $('lightbox'); if (lb) lb.remove(); }
function moveLightbox(dir) {
  _lightboxIdx = (_lightboxIdx + dir + _lightboxPhotos.length) % _lightboxPhotos.length;
  const img = $('lightbox-img');
  if (img) img.src = _lightboxPhotos[_lightboxIdx].url;
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchTab('rankings');
  $('player-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
  document.addEventListener('keydown', e => {
    if (!$('lightbox')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft')  moveLightbox(-1);
    if (e.key === 'ArrowRight') moveLightbox(1);
  });
});
