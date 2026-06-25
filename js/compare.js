(function () {
  const HIGH_LEVEL_MIN = 91;

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function text(value, fallback = '-') {
    const str = String(value ?? '').trim();
    return str || fallback;
  }

  function normalizeClass(value) {
    const raw = text(value, '미확인');
    return window.PRASIA_MAPPINGS?.classes?.[raw] || raw;
  }

  function serverCodeFromWorldId(worldId) {
    const match = String(worldId || '').match(/LIVE_W(\d+)_R(\d+)/i);
    if (!match) return '';
    return `${Number(match[1])}-${Number(match[2])}`;
  }

  function serverName(value, item = {}) {
    const candidates = [
      value,
      item.server,
      item.world,
      item.world_name,
      item.server_name,
      serverCodeFromWorldId(item.world_id),
      serverCodeFromWorldId(item.worldId),
    ].filter(Boolean).map(v => String(v).trim());
    const map = window.PRASIA_MAPPINGS?.servers || {};
    for (const candidate of candidates) {
      if (map[candidate]) return map[candidate];
    }
    return candidates[0] || '-';
  }

  function formatSnapshotId(id) {
    if (!id) return '-';
    const s = String(id);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
    return s.replace('_', ' ');
  }

  function asList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['guilds', 'rankings', 'items', 'data', 'ranking']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  }

  function normalizeDist(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.entries(obj).forEach(([k, v]) => {
      const n = toNumber(v, 0);
      if (n > 0) out[String(k)] = n;
    });
    return out;
  }

  function normalizeLevelClassDist(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.entries(obj).forEach(([level, classes]) => {
      out[String(level)] = {};
      if (classes && typeof classes === 'object') {
        Object.entries(classes).forEach(([cls, cnt]) => {
          const n = toNumber(cnt, 0);
          if (n > 0) out[String(level)][normalizeClass(cls)] = n;
        });
      }
      if (!Object.keys(out[String(level)]).length) delete out[String(level)];
    });
    return out;
  }

  function normalizeMembers(members, guildMaster) {
    const list = Array.isArray(members) ? members : [];
    const seen = new Set();
    return list
      .map(m => ({
        nickname: text(m.nickname ?? m.name ?? m.gc_name ?? m.character_name, '-'),
        level: toNumber(m.level ?? m.gc_level ?? m.character_level, 0),
        class: normalizeClass(m.class ?? m.class_name ?? m.job ?? m.ranking_class_name ?? m.classCode),
        is_master: text(m.nickname ?? m.name ?? m.gc_name ?? m.character_name, '-') === text(guildMaster, '') || Boolean(m.is_master),
      }))
      .filter(m => m.nickname !== '-' && m.level >= HIGH_LEVEL_MIN)
      .filter(m => {
        const key = `${m.nickname}|${m.level}|${m.class}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(b.is_master) - Number(a.is_master) || b.level - a.level || a.nickname.localeCompare(b.nickname, 'ko'));
  }

  function buildDistFromMembers(members) {
    const level = {};
    const cls = {};
    const levelCls = {};
    for (const m of members) {
      const lv = String(m.level);
      level[lv] = (level[lv] || 0) + 1;
      cls[m.class] = (cls[m.class] || 0) + 1;
      levelCls[lv] ||= {};
      levelCls[lv][m.class] = (levelCls[lv][m.class] || 0) + 1;
    }
    return { level, cls, levelCls };
  }

  function normalizeGuild(item, index = 0) {
    const master = text(item.guild_master ?? item.guildMaster ?? item.master ?? item.master_name, '-');
    const members = normalizeMembers(item.members, master);
    const memberDist = buildDistFromMembers(members);
    const levelDistribution = Object.keys(memberDist.level).length
      ? memberDist.level
      : normalizeDist(item.level_distribution ?? item.level_counts);
    const classDistribution = Object.keys(memberDist.cls).length
      ? memberDist.cls
      : normalizeDist(item.class_distribution);
    const levelClassDistribution = Object.keys(memberDist.levelCls).length
      ? memberDist.levelCls
      : normalizeLevelClassDist(item.level_class_distribution);
    const highLevelCount = toNumber(item.high_level_count, Object.values(levelDistribution).reduce((a, b) => a + toNumber(b), 0));
    return {
      raw: item,
      server: text(item.server ?? item.world ?? item.world_name ?? serverCodeFromWorldId(item.world_id), '-'),
      serverName: serverName(item.server ?? item.world, item),
      guild_name: text(item.guild_name ?? item.guild ?? item.guildName, '-'),
      guild_master: master,
      guild_rank: toNumber(item.guild_rank ?? item.ranking ?? item.rank, index + 1),
      guild_score: toNumber(item.guild_score ?? item.score ?? item.total_score, 0),
      guild_level: item.guild_level ?? null,
      guild_member_count: item.guild_member_count ?? item.member_count ?? null,
      high_level_count: highLevelCount,
      max_level: toNumber(item.max_level, Math.max(0, ...Object.keys(levelDistribution).map(Number))),
      level_distribution: levelDistribution,
      class_distribution: classDistribution,
      level_class_distribution: levelClassDistribution,
      members,
    };
  }

  function distributionSimilarity(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    let diff = 0;
    let total = 0;
    for (const key of keys) {
      const av = toNumber(a?.[key]);
      const bv = toNumber(b?.[key]);
      diff += Math.abs(av - bv);
      total += av + bv;
    }
    if (total <= 0) return 0;
    return Math.max(0, 1 - diff / total);
  }

  function levelClassSimilarity(a, b) {
    const flatten = (obj) => {
      const out = {};
      Object.entries(obj || {}).forEach(([level, classes]) => {
        Object.entries(classes || {}).forEach(([cls, cnt]) => {
          out[`${level}|${normalizeClass(cls)}`] = toNumber(cnt);
        });
      });
      return out;
    };
    return distributionSimilarity(flatten(a), flatten(b));
  }

  function countSimilarity(a, b) {
    a = toNumber(a); b = toNumber(b);
    if (Math.max(a, b) <= 0) return 0;
    return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
  }

  function scoreSimilarity(a, b) {
    a = toNumber(a); b = toNumber(b);
    if (Math.max(a, b) <= 0) return 0;
    const pct = Math.abs(a - b) / Math.max(a, b);
    return Math.max(0, 1 - pct / 0.25);
  }

  function nameBonus(a, b) {
    const aa = text(a, '').replace(/\s+/g, '').toLowerCase();
    const bb = text(b, '').replace(/\s+/g, '').toLowerCase();
    if (!aa || !bb) return 0;
    if (aa === bb) return 1;
    if (aa.includes(bb) || bb.includes(aa)) return 0.5;
    return 0;
  }

  function compareGuild(before, after) {
    const parts = {
      master: text(before.guild_master, '') && text(before.guild_master, '') === text(after.guild_master, '') ? 22 : 0,
      levelClass: levelClassSimilarity(before.level_class_distribution, after.level_class_distribution) * 28,
      level: distributionSimilarity(before.level_distribution, after.level_distribution) * 17,
      class: distributionSimilarity(before.class_distribution, after.class_distribution) * 15,
      highCount: countSimilarity(before.high_level_count, after.high_level_count) * 8,
      score: scoreSimilarity(before.guild_score, after.guild_score) * 7,
      name: nameBonus(before.guild_name, after.guild_name) * 3,
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    const evidence = [];
    if (parts.master > 0) evidence.push('결사장 일치');
    if (parts.name >= 3) evidence.push('결사명 일치');
    else if (parts.name > 0) evidence.push('결사명 일부 유사');
    if (parts.levelClass >= 19) evidence.push('레벨별 직업군 유사');
    if (parts.level >= 12) evidence.push('레벨 분포 유사');
    if (parts.class >= 10) evidence.push('직업군 분포 유사');
    if (parts.score >= 4.5) evidence.push('결사 점수 근접');
    return { before, after, parts, total, evidence, judgement: judgement(total) };
  }

  function judgement(score) {
    if (score >= 85) return { key: 'very-high', text: '매우 유력' };
    if (score >= 70) return { key: 'high', text: '유력' };
    if (score >= 55) return { key: 'possible', text: '가능성 있음' };
    return { key: 'low', text: '낮음' };
  }

  function buildMatches(beforePayload, afterPayload, options = {}) {
    const beforeAll = asList(beforePayload).map(normalizeGuild).sort((a, b) => a.guild_rank - b.guild_rank);
    const afterAll = asList(afterPayload).map(normalizeGuild).sort((a, b) => a.guild_rank - b.guild_rank);
    const beforeLimit = Number(options.beforeLimit || 200);
    const afterLimit = Number(options.afterLimit || 400);
    const beforeList = beforeLimit > 0 ? beforeAll.slice(0, beforeLimit) : beforeAll;
    const afterList = afterLimit > 0 ? afterAll.slice(0, afterLimit) : afterAll;
    const matches = beforeList.map(before => {
      let best = null;
      for (const after of afterList) {
        const match = compareGuild(before, after);
        if (!best || match.total > best.total) best = match;
      }
      return best;
    }).filter(Boolean).sort((a, b) => a.before.guild_rank - b.before.guild_rank);
    return { matches, beforeCount: beforeAll.length, afterCount: afterAll.length, comparedBefore: beforeList.length, comparedAfter: afterList.length };
  }

  window.PrasiaCompare = { buildMatches, formatSnapshotId, serverName, normalizeGuild, toNumber };
})();
