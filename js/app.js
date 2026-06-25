const state = {
  snapshots: [],
  matches: [],
  beforePayload: null,
  afterPayload: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

async function fetchJson(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} 로드 실패 (${res.status})`);
  return res.json();
}

async function loadSnapshotIndex() {
  let payload;
  try {
    payload = await fetchJson('data/snapshots_index.json');
  } catch (err) {
    try {
      payload = await fetchJson('data/snapshots/manifest.json');
    } catch (err2) {
      payload = { snapshots: [] };
    }
  }
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  state.snapshots = snapshots
    .filter(s => s && s.id)
    .map(s => ({
      id: s.id,
      label: PrasiaCompare.formatSnapshotId(s.id),
      created_at: s.created_at || s.label || '',
      path: s.path || `data/snapshots/${s.id}/guilds.json`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  renderSnapshotOptions();
}

function renderSnapshotOptions() {
  $('snapshotCount').textContent = state.snapshots.length.toLocaleString('ko-KR');
  const before = $('beforeSelect');
  const after = $('afterSelect');
  before.innerHTML = '';
  after.innerHTML = '';
  if (!state.snapshots.length) {
    before.innerHTML = '<option value="">저장된 스냅샷 없음</option>';
    after.innerHTML = '<option value="">저장된 스냅샷 없음</option>';
    setSummary(null, null, '-', '스냅샷 없음');
    setEmpty('저장된 스냅샷이 없습니다. 먼저 Actions에서 스냅샷을 생성해주세요.');
    closeModal();
    return;
  }
  for (const snap of state.snapshots) {
    const label = snap.label;
    const opt1 = new Option(label, snap.id);
    const opt2 = new Option(label, snap.id);
    before.add(opt1);
    after.add(opt2);
  }
  before.selectedIndex = Math.max(0, state.snapshots.length - 2);
  after.selectedIndex = Math.max(0, state.snapshots.length - 1);
}

function selectedSnapshot(selectId) {
  const id = $(selectId).value;
  return state.snapshots.find(s => s.id === id);
}

async function compareSelected() {
  const beforeSnap = selectedSnapshot('beforeSelect');
  const afterSnap = selectedSnapshot('afterSelect');
  if (!beforeSnap || !afterSnap) return setEmpty('비교할 스냅샷을 선택해주세요.');
  if (beforeSnap.id === afterSnap.id) return setEmpty('서로 다른 이전/이후 스냅샷을 선택해주세요.');

  setSummary(beforeSnap, afterSnap, '-', '불러오는 중');
  setEmpty('선택한 스냅샷을 불러오는 중입니다.');
  try {
    const [beforePayload, afterPayload] = await Promise.all([fetchJson(beforeSnap.path), fetchJson(afterSnap.path)]);
    state.beforePayload = beforePayload;
    state.afterPayload = afterPayload;
    const result = PrasiaCompare.buildMatches(beforePayload, afterPayload, {
      beforeLimit: Number($('beforeLimitSelect').value),
      afterLimit: Number($('afterLimitSelect').value),
    });
    state.matches = result.matches;
    setSummary(beforeSnap, afterSnap, `${result.comparedBefore.toLocaleString('ko-KR')} × ${result.comparedAfter.toLocaleString('ko-KR')}`, '완료');
    renderResults();
  } catch (err) {
    console.error(err);
    setSummary(beforeSnap, afterSnap, '-', '실패');
    setEmpty(`데이터 로드 실패: ${escapeHtml(err.message)}`);
  }
}

function setSummary(beforeSnap, afterSnap, target, status) {
  const cells = $('compareSummary').querySelectorAll('strong');
  cells[0].textContent = beforeSnap ? beforeSnap.label : '-';
  cells[1].textContent = afterSnap ? afterSnap.label : '-';
  cells[2].textContent = target;
  cells[3].textContent = status;
}

function setEmpty(message) {
  $('resultBody').innerHTML = `<tr><td colspan="9" class="empty">${message}</td></tr>`;
  setNotice('');
}

function sameServer(m) {
  return String(m.before.serverName || '') === String(m.after.serverName || '');
}

function sameGuildIdentity(m) {
  return sameServer(m)
    && String(m.before.guild_name || '') === String(m.after.guild_name || '')
    && String(m.before.guild_master || '') === String(m.after.guild_master || '');
}

function serverMoveHtml(m) {
  const before = escapeHtml(m.before.serverName || '-');
  const after = escapeHtml(m.after.serverName || '-');
  if (sameServer(m)) return `<span class="server-same">${before}</span>`;
  return `<span class="server-move"><span>${before}</span><b>→</b><span>${after}</span></span>`;
}

function displayJudgement(m) {
  if (sameGuildIdentity(m)) return { key: 'no-change', text: '변동없음' };
  if (sameServer(m)) return { key: 'same-server', text: '동일 서버' };
  return m.judgement;
}

function setNotice(message) {
  const notice = $('resultNotice');
  if (!notice) return;
  if (!message) {
    notice.hidden = true;
    notice.innerHTML = '';
    return;
  }
  notice.hidden = false;
  notice.innerHTML = message;
}

function renderConcentrationNotice(rows) {
  if (!rows.length) return setNotice('');
  const counts = new Map();
  for (const m of rows) {
    const key = `${m.after.serverName}|${m.after.guild_name}|${m.after.guild_master}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let maxCount = 0;
  let maxMatch = null;
  for (const m of rows) {
    const key = `${m.after.serverName}|${m.after.guild_name}|${m.after.guild_master}`;
    const count = counts.get(key) || 0;
    if (count > maxCount) {
      maxCount = count;
      maxMatch = m;
    }
  }
  const lowCount = rows.filter(m => m.total < 55).length;
  if (maxCount >= 5 || lowCount >= Math.ceil(rows.length * 0.45)) {
    const target = maxMatch ? `${escapeHtml(maxMatch.after.serverName)} / ${escapeHtml(maxMatch.after.guild_name)} / ${escapeHtml(maxMatch.after.guild_master)}` : '특정 이후 결사';
    setNotice(`
      <strong>해석 주의</strong>
      <span>현재 ${maxCount.toLocaleString('ko-KR')}개 후보가 <b>${target}</b> 쪽으로 반복 매칭되고 있어요. 서버 이전이 아직 완료되지 않았거나 이후 후보 범위가 좁을 때 생길 수 있는 현상이라, <b>낮음/동일 서버 후보는 확정 추적 결과가 아니고 참고용</b>으로 보면 돼요.</span>
    `);
  } else {
    setNotice('');
  }
}

function filterMatches() {
  const q = $('searchInput').value.trim().toLowerCase();
  const move = $('moveFilter')?.value || 'all';
  const grade = $('gradeFilter').value;
  return state.matches.filter(m => {
    const hay = [m.before.guild_name, m.before.guild_master, m.before.serverName, m.after.guild_name, m.after.guild_master, m.after.serverName].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (move === 'moved' && sameServer(m)) return false;
    if (move === 'same' && !sameServer(m)) return false;
    if (move === 'noChange' && !sameGuildIdentity(m)) return false;
    if (grade === 'veryHigh') return m.total >= 85;
    if (grade === 'high') return m.total >= 70;
    if (grade === 'possible') return m.total >= 55;
    if (grade === 'lowOnly') return m.total < 55;
    return true;
  });
}

function renderResults() {
  const rows = filterMatches();
  if (!rows.length) return setEmpty('조건에 맞는 후보가 없습니다.');
  renderConcentrationNotice(rows);
  $('resultBody').innerHTML = rows.map((m) => {
    const judgement = displayJudgement(m);
    return `
      <tr class="${sameServer(m) ? 'same-server-row' : 'moved-server-row'}">
        <td>${m.before.guild_rank}</td>
        <td class="guild-name">${escapeHtml(m.before.guild_name)}</td>
        <td>${escapeHtml(m.before.guild_master)}</td>
        <td class="server-name">${serverMoveHtml(m)}</td>
        <td class="guild-name">${escapeHtml(m.after.guild_name)}</td>
        <td>${escapeHtml(m.after.guild_master)}</td>
        <td class="score">${m.total.toFixed(1)}점</td>
        <td><span class="badge ${judgement.key}">${judgement.text}</span></td>
        <td><button class="view-btn" type="button" data-index="${state.matches.indexOf(m)}">보기</button></td>
      </tr>`;
  }).join('');
}

function distHtml(title, before, after) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .sort((a,b) => String(b).localeCompare(String(a), 'ko', {numeric:true}));
  if (!keys.length) return `<div class="score-row"><span>${title}</span><strong>자료 없음</strong></div>`;
  return `<div class="score-row"><span>${title}</span><strong>${keys.map(k => `${escapeHtml(k)} ${before?.[k] || 0}→${after?.[k] || 0}`).join(' / ')}</strong></div>`;
}

function memberTable(title, guild) {
  const members = guild.members || [];
  const body = members.length ? members.map(m => `
    <tr class="${m.is_master ? 'master-row' : ''}">
      <td>${escapeHtml(m.nickname)}</td>
      <td>${m.level}</td>
      <td>${escapeHtml(m.class)}</td>
    </tr>
  `).join('') : `<tr><td colspan="3" class="empty">91+ 멤버 원본 없음</td></tr>`;
  return `
    <div class="member-box">
      <h3>${title}</h3>
      <table class="member-table">
        <thead><tr><th>닉네임</th><th>레벨</th><th>직업군</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function openModal(matchIndex) {
  const m = state.matches[Number(matchIndex)];
  if (!m) return;
  $('modalTitle').textContent = `${m.before.guild_name} → ${m.after.guild_name}`;
  $('modalSub').innerHTML = `${escapeHtml(m.before.serverName)} ${escapeHtml(m.before.guild_master)} → ${escapeHtml(m.after.serverName)} ${escapeHtml(m.after.guild_master)}`;
  const p = m.parts;
  $('modalContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-card"><span>유사도</span><strong>${m.total.toFixed(1)}점</strong></div>
      <div class="detail-card"><span>판정</span><strong>${m.judgement.text}</strong></div>
      <div class="detail-card"><span>이전 점수</span><strong>${m.before.guild_score.toLocaleString('ko-KR')}</strong></div>
      <div class="detail-card"><span>이후 점수</span><strong>${m.after.guild_score.toLocaleString('ko-KR')}</strong></div>
    </div>
    <div class="evidence-list">${m.evidence.length ? m.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('') : '<span>강한 일치 근거 없음</span>'}</div>
    <div class="score-breakdown">
      <div class="score-row"><span>결사장</span><strong>${p.master.toFixed(1)} / 22</strong></div>
      <div class="score-row"><span>레벨별 직업군</span><strong>${p.levelClass.toFixed(1)} / 28</strong></div>
      <div class="score-row"><span>레벨 분포</span><strong>${p.level.toFixed(1)} / 17</strong></div>
      <div class="score-row"><span>직업군 분포</span><strong>${p.class.toFixed(1)} / 15</strong></div>
      <div class="score-row"><span>91+ 인원 수</span><strong>${p.highCount.toFixed(1)} / 8</strong></div>
      <div class="score-row"><span>결사 점수 근접도</span><strong>${p.score.toFixed(1)} / 7</strong></div>
      <div class="score-row"><span>결사명 보너스</span><strong>${p.name.toFixed(1)} / 3</strong></div>
      ${distHtml('레벨 분포', m.before.level_distribution, m.after.level_distribution)}
      ${distHtml('직업군 분포', m.before.class_distribution, m.after.class_distribution)}
    </div>
    <div class="member-columns">
      ${memberTable('이전 멤버', m.before)}
      ${memberTable('이후 멤버', m.after)}
    </div>
  `;
  $('modalBackdrop').hidden = false;
}

function closeModal() {
  $('modalBackdrop').hidden = true;
}

function bindEvents() {
  $('reloadBtn').addEventListener('click', loadSnapshotIndex);
  $('compareBtn').addEventListener('click', compareSelected);
  $('searchInput').addEventListener('input', renderResults);
  $('moveFilter')?.addEventListener('change', renderResults);
  $('gradeFilter').addEventListener('change', renderResults);
  $('beforeLimitSelect').addEventListener('change', () => state.matches.length && compareSelected());
  $('afterLimitSelect').addEventListener('change', () => state.matches.length && compareSelected());
  $('resultBody').addEventListener('click', e => {
    const btn = e.target.closest('[data-index]');
    if (btn) openModal(btn.dataset.index);
  });
  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
}

bindEvents();
closeModal();
loadSnapshotIndex();
