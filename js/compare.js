(function () {
  // 추적 기준: 92레벨 이상 + 토벌 25/26 지문을 우선 사용합니다.
  // 토벌 필드가 없는 스냅샷은 토벌 점수 항목을 자동 제외해서 기존 데이터도 비교 가능합니다.
  const TRACE_CONFIG = {
    highLevelMin: 92,
    huntThresholds: [26, 25],
  };

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function text(value, fallback = '-') {
    const str = String(value ?? '').trim();
    return str || fallback;
  }

  function normText(value) {
    return text(value, '').replace(/\s+/g, '').toLowerCase();
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

  function normalizeDist(obj, options = {}) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    const minLevel = options.minLevel ?? null;
    Object.entries(obj).forEach(([k, v]) => {
      if (minLevel !== null && /^\d+$/.test(String(k)) && Number(k) < minLevel) return;
      const n = toNumber(v, 0);
      if (n > 0) out[String(k)] = n;
    });
    return out;
  }

  function normalizeLevelClassDist(obj, options = {}) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    const minLevel = options.minLevel ?? TRACE_CONFIG.highLevelMin;
    Object.entries(obj).forEach(([level, classes]) => {
      if (Number(level) < minLevel) return;
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

  function normalizeHuntLevel(member) {
    const candidates = [
      member.hunt_level,
      member.huntLevel,
      member.subjugation_level,
      member.subjugationLevel,
      member.raid_level,
      member.raidLevel,
      member.boss_level,
      member.bossLevel,
      member.boss_clear_level,
      member.bossClearLevel,
      member.content_level,
      member.contentLevel,
      member.tobul_level,
      member.tobulLevel,
      member.토벌레벨,
      member.토벌,
    ];
    for (const value of candidates) {
      const n = toNumber(value, NaN);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  function normalizeMembers(members, guildMaster) {
    const list = Array.isArray(members) ? members : [];
    const seen = new Set();
    return list
      .map(m => ({
        nickname: text(m.nickname ?? m.name ?? m.gc_name ?? m.character_name, '-'),
        level: toNumber(m.level ?? m.gc_level ?? m.character_level, 0),
        class: normalizeClass(m.class ?? m.class_name ?? m.job ?? m.ranking_class_name ?? m.classCode),
        hunt_level: normalizeHuntLevel(m),
        is_master: text(m.nickname ?? m.name ?? m.gc_name ?? m.character_name, '-') === text(guildMaster, '') || Boolean(m.is_master),
      }))
      .filter(m => m.nickname !== '-' && m.level >= TRACE_CONFIG.highLevelMin)
      .filter(m => {
        const key = `${m.nickname}|${m.level}|${m.class}|${m.hunt_level ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(b.is_master) - Number(a.is_master) || b.level - a.level || a.nickname.localeCompare(b.nickname, 'ko'));
  }

  function addCount(obj, key, inc = 1) {
    obj[key] = (obj[key] || 0) + inc;
  }

  function buildDistFromMembers(members) {
    const level = {};
    const cls = {};
    const levelCls = {};
    const huntThreshold = {};
    const classHunt = {};
    const levelClassHunt = {};
    let huntMemberCount = 0;

    for (const m of members) {
      const lv = String(m.level);
      addCount(level, lv);
      addCount(cls, m.class);
      levelCls[lv] ||= {};
      addCount(levelCls[lv], m.class);

      if (m.hunt_level !== null && m.hunt_level !== undefined) {
        huntMemberCount += 1;
        for (const threshold of TRACE_CONFIG.huntThresholds) {
          if (m.hunt_level >= threshold) {
            addCount(huntThreshold, `${threshold}+`);
            addCount(classHunt, `${m.class}|${threshold}+`);
            addCount(levelClassHunt, `${m.level}|${m.class}|${threshold}+`);
          }
        }
      }
    }
    return { level, cls, levelCls, huntThreshold, classHunt, levelClassHunt, huntMemberCount };
  }

  function pickFirstObject(item, keys) {
    for (const key of keys) {
      if (item[key] && typeof item[key] === 'object') return item[key];
    }
    return null;
  }

  function normalizeGuild(item, index = 0) {
    const master = text(item.guild_master ?? item.guildMaster ?? item.master ?? item.master_name, '-');
    const members = normalizeMembers(item.members, master);
    const memberDist = buildDistFromMembers(members);

    const levelDistribution = Object.keys(memberDist.level).length
      ? memberDist.level
      : normalizeDist(item.level_distribution_92plus ?? item.level_distribution ?? item.level_counts, { minLevel: TRACE_CONFIG.highLevelMin });

    // class_distribution은 91+ 전체값일 수 있으므로 멤버가 없고 92+ 전용 필드도 없으면 비워둡니다.
    const explicitClass92 = item.class_distribution_92plus ?? item.class_distribution_high ?? null;
    const classDistribution = Object.keys(memberDist.cls).length
      ? memberDist.cls
      : normalizeDist(explicitClass92);

    const explicitLevelClass92 = item.level_class_distribution_92plus ?? item.level_class_distribution_high ?? null;
    const levelClassDistribution = Object.keys(memberDist.levelCls).length
      ? memberDist.levelCls
      : normalizeLevelClassDist(explicitLevelClass92 ?? item.level_class_distribution, { minLevel: TRACE_CONFIG.highLevelMin });

    const prebuiltHuntThreshold = pickFirstObject(item, ['hunt_threshold_distribution', 'hunt_distribution', 'tobul_distribution']);
    const prebuiltClassHunt = pickFirstObject(item, ['class_hunt_distribution_92plus', 'class_hunt_distribution']);
    const prebuiltLevelClassHunt = pickFirstObject(item, ['level_class_hunt_distribution_92plus', 'level_class_hunt_distribution']);

    const huntThresholdDistribution = Object.keys(memberDist.huntThreshold).length ? memberDist.huntThreshold : normalizeDist(prebuiltHuntThreshold);
    const classHuntDistribution = Object.keys(memberDist.classHunt).length ? memberDist.classHunt : normalizeDist(prebuiltClassHunt);
    const levelClassHuntDistribution = Object.keys(memberDist.levelClassHunt).length ? memberDist.levelClassHunt : normalizeDist(prebuiltLevelClassHunt);
    const hasHuntData = Object.keys(huntThresholdDistribution).length || Object.keys(classHuntDistribution).length || Object.keys(levelClassHuntDistribution).length;

    const highLevelCount = Object.values(levelDistribution).reduce((a, b) => a + toNumber(b), 0);
    const masterMember = members.find(m => m.is_master) || members.find(m => m.nickname === master) || null;

    return {
      raw: item,
      uid: `${text(item.server ?? item.world ?? item.world_name ?? serverCodeFromWorldId(item.world_id), '-')}/${text(item.guild_name ?? item.guild ?? item.guildName, '-')}/${master}/${index}`,
      server: text(item.server ?? item.world ?? item.world_name ?? serverCodeFromWorldId(item.world_id), '-'),
      serverName: serverName(item.server ?? item.world, item),
      guild_name: text(item.guild_name ?? item.guild ?? item.guildName, '-'),
      guild_master: master,
      guild_rank: toNumber(item.guild_rank ?? item.ranking ?? item.rank, index + 1),
      guild_score: toNumber(item.guild_score ?? item.score ?? item.total_score, 0),
      guild_level: item.guild_level ?? null,
      guild_member_count: item.guild_member_count ?? item.member_count ?? null,
      high_level_count: highLevelCount || toNumber(item.high_level_count_92plus ?? item.high_level_count, 0),
      max_level: toNumber(item.max_level, Math.max(0, ...Object.keys(levelDistribution).map(Number))),
      level_distribution: levelDistribution,
      class_distribution: classDistribution,
      level_class_distribution: levelClassDistribution,
      hunt_threshold_distribution: huntThresholdDistribution,
      class_hunt_distribution: classHuntDistribution,
      level_class_hunt_distribution: levelClassHuntDistribution,
      has_hunt_data: hasHuntData,
      hunt_member_count: memberDist.huntMemberCount || toNumber(item.hunt_member_count, 0),
      master_level: masterMember ? masterMember.level : toNumber(item.master_level, 0),
      master_class: masterMember ? masterMember.class : normalizeClass(item.master_class ?? item.guild_master_class ?? ''),
      members,
    };
  }

  function flattenLevelClass(obj) {
    const out = {};
    Object.entries(obj || {}).forEach(([level, classes]) => {
      Object.entries(classes || {}).forEach(([cls, cnt]) => {
        out[`${level}|${normalizeClass(cls)}`] = toNumber(cnt);
      });
    });
    return out;
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
    if (total <= 0) return null;
    return Math.max(0, 1 - diff / total);
  }

  function weightedDistributionSimilarity(a, b, weights = {}) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    let diff = 0;
    let total = 0;
    for (const key of keys) {
      const w = toNumber(weights[key], 1);
      const av = toNumber(a?.[key]);
      const bv = toNumber(b?.[key]);
      diff += Math.abs(av - bv) * w;
      total += (av + bv) * w;
    }
    if (total <= 0) return null;
    return Math.max(0, 1 - diff / total);
  }

  function countSimilarity(a, b) {
    a = toNumber(a); b = toNumber(b);
    if (Math.max(a, b) <= 0) return null;
    return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
  }

  function scoreSimilarity(a, b) {
    a = toNumber(a); b = toNumber(b);
    if (Math.max(a, b) <= 0) return null;
    const pct = Math.abs(a - b) / Math.max(a, b);
    return Math.max(0, 1 - pct / 0.25);
  }

  function nameBonus(a, b) {
    const aa = normText(a);
    const bb = normText(b);
    if (!aa || !bb) return 0;
    if (aa === bb) return 1;
    if (aa.includes(bb) || bb.includes(aa)) return 0.5;
    return 0;
  }

  function sameServer(a, b) {
    return String(a.serverName || '') === String(b.serverName || '');
  }

  function sameGuildIdentity(a, b) {
    return sameServer(a, b) && normText(a.guild_name) === normText(b.guild_name) && normText(a.guild_master) === normText(b.guild_master);
  }

  function buildRarityContext(beforeList, afterList) {
    const freq = {};
    const huntFreq = {};
    const totalGuilds = beforeList.length + afterList.length;
    for (const guild of [...beforeList, ...afterList]) {
      const flat = flattenLevelClass(guild.level_class_distribution);
      for (const key of Object.keys(flat)) {
        if (toNumber(flat[key]) > 0) freq[key] = (freq[key] || 0) + 1;
      }
      for (const key of Object.keys(guild.level_class_hunt_distribution || {})) {
        if (toNumber(guild.level_class_hunt_distribution[key]) > 0) huntFreq[key] = (huntFreq[key] || 0) + 1;
      }
    }
    const levelClassWeights = {};
    Object.entries(freq).forEach(([key, count]) => {
      const level = toNumber(String(key).split('|')[0], TRACE_CONFIG.highLevelMin);
      const rarity = Math.log((totalGuilds + 1) / (count + 1)) + 1;
      const levelBoost = 1 + Math.max(0, level - TRACE_CONFIG.highLevelMin) * 0.22;
      levelClassWeights[key] = Math.min(5.0, rarity * levelBoost);
    });
    const levelClassHuntWeights = {};
    Object.entries(huntFreq).forEach(([key, count]) => {
      const [level, , hunt] = String(key).split('|');
      const rarity = Math.log((totalGuilds + 1) / (count + 1)) + 1.2;
      const levelBoost = 1 + Math.max(0, toNumber(level, TRACE_CONFIG.highLevelMin) - TRACE_CONFIG.highLevelMin) * 0.25;
      const huntBoost = String(hunt).startsWith('26') ? 1.35 : 1.0;
      levelClassHuntWeights[key] = Math.min(6.0, rarity * levelBoost * huntBoost);
    });
    return { levelClassWeights, levelClassHuntWeights };
  }

  function addPart(parts, maxes, key, similarity, maxScore) {
    maxes[key] = 0;
    parts[key] = 0;
    if (similarity === null || similarity === undefined || Number.isNaN(similarity)) return;
    maxes[key] = maxScore;
    parts[key] = Math.max(0, Math.min(1, similarity)) * maxScore;
  }

  function tieBreakScore(before, after) {
    const rankDiff = Math.abs(toNumber(before.guild_rank) - toNumber(after.guild_rank));
    const scoreClose = scoreSimilarity(before.guild_score, after.guild_score) ?? 0;
    const memberClose = countSimilarity(before.guild_member_count, after.guild_member_count) ?? 0;
    const guildLevelClose = countSimilarity(before.guild_level, after.guild_level) ?? 0;
    const masterLevel = before.master_level && after.master_level && before.master_level === after.master_level ? 0.08 : 0;
    const masterClass = before.master_class && after.master_class && before.master_class === after.master_class ? 0.08 : 0;
    const maxLevel = before.max_level && after.max_level && before.max_level === after.max_level ? 0.05 : 0;
    const exactName = normText(before.guild_name) && normText(before.guild_name) === normText(after.guild_name) ? 0.12 : 0;
    const exactMaster = normText(before.guild_master) && normText(before.guild_master) === normText(after.guild_master) ? 0.18 : 0;
    const noChange = sameGuildIdentity(before, after) ? 1.0 : 0;
    return noChange + exactName + exactMaster + masterLevel + masterClass + maxLevel + scoreClose * 0.25 + memberClose * 0.12 + guildLevelClose * 0.08 + Math.max(0, 1 - rankDiff / 500) * 0.08;
  }

  function compareGuild(before, after, context = {}) {
    const flatBefore = flattenLevelClass(before.level_class_distribution);
    const flatAfter = flattenLevelClass(after.level_class_distribution);
    const levelClassBase = distributionSimilarity(flatBefore, flatAfter);
    const levelClassWeighted = weightedDistributionSimilarity(flatBefore, flatAfter, context.levelClassWeights);
    const levelClassMixed = levelClassBase === null && levelClassWeighted === null
      ? null
      : (toNumber(levelClassBase, 0) * 0.45 + toNumber(levelClassWeighted, 0) * 0.55);

    const huntAvailable = before.has_hunt_data && after.has_hunt_data;
    const huntThresholdSim = huntAvailable ? distributionSimilarity(before.hunt_threshold_distribution, after.hunt_threshold_distribution) : null;
    const classHuntSim = huntAvailable ? distributionSimilarity(before.class_hunt_distribution, after.class_hunt_distribution) : null;
    const levelClassHuntSim = huntAvailable ? weightedDistributionSimilarity(before.level_class_hunt_distribution, after.level_class_hunt_distribution, context.levelClassHuntWeights) : null;

    const parts = {};
    const maxes = {};
    addPart(parts, maxes, 'master', normText(before.guild_master) && normText(before.guild_master) === normText(after.guild_master) ? 1 : 0, 18);
    addPart(parts, maxes, 'name', nameBonus(before.guild_name, after.guild_name), 5);
    addPart(parts, maxes, 'score', scoreSimilarity(before.guild_score, after.guild_score), 6);
    const rankDiff = Math.abs(toNumber(before.guild_rank) - toNumber(after.guild_rank));
    addPart(parts, maxes, 'rankTie', Math.max(0, 1 - rankDiff / 500), 4);

    addPart(parts, maxes, 'highCount', countSimilarity(before.high_level_count, after.high_level_count), 10);
    addPart(parts, maxes, 'level', distributionSimilarity(before.level_distribution, after.level_distribution), 12);
    addPart(parts, maxes, 'class', distributionSimilarity(before.class_distribution, after.class_distribution), 12);
    addPart(parts, maxes, 'levelClass', levelClassMixed, 18);

    addPart(parts, maxes, 'huntThreshold', huntThresholdSim, 6);
    addPart(parts, maxes, 'classHunt', classHuntSim, 10);
    addPart(parts, maxes, 'levelClassHunt', levelClassHuntSim, 17);

    parts.masterProfile = 0;
    maxes.masterProfile = parts.master > 0 ? 2 : 0;
    if (parts.master > 0) {
      if (before.master_level && after.master_level && before.master_level === after.master_level) parts.masterProfile += 1.0;
      if (before.master_class && after.master_class && before.master_class === after.master_class) parts.masterProfile += 1.0;
    }

    const raw = Object.values(parts).reduce((a, b) => a + toNumber(b), 0);
    const max = Object.values(maxes).reduce((a, b) => a + toNumber(b), 0) || 1;
    let total = Math.max(0, Math.min(100, raw / max * 100));
    if (sameGuildIdentity(before, after) && total >= 96) total = 100;

    const internalScore = total + tieBreakScore(before, after) / 1000;
    const evidence = [];
    if (parts.master > 0) evidence.push('결사장 일치');
    if (parts.masterProfile > 0) evidence.push('결사장 레벨/직업 보정');
    if (parts.name >= 4.9) evidence.push('결사명 일치');
    else if (parts.name > 0) evidence.push('결사명 일부 유사');
    if (parts.levelClass >= maxes.levelClass * 0.72) evidence.push('92+ 레벨별 직업군 유사');
    if (levelClassWeighted !== null && levelClassBase !== null && levelClassWeighted > levelClassBase + 0.03) evidence.push('희귀 92+ 레벨×직업 패턴 보정');
    if (parts.level >= maxes.level * 0.72) evidence.push('92+ 레벨 분포 유사');
    if (parts.class >= maxes.class * 0.72) evidence.push('92+ 직업군 분포 유사');
    if (huntAvailable) {
      if (parts.huntThreshold >= maxes.huntThreshold * 0.7) evidence.push('토벌25+/26+ 인원 분포 유사');
      if (parts.classHunt >= maxes.classHunt * 0.7) evidence.push('직업군별 토벌 분포 유사');
      if (parts.levelClassHunt >= maxes.levelClassHunt * 0.7) evidence.push('92+ 직업군×토벌 지문 유사');
    } else {
      evidence.push('토벌 데이터 없음: 토벌 점수 제외');
    }
    if (parts.score >= maxes.score * 0.65) evidence.push('결사 점수 근접');

    return {
      before,
      after,
      parts,
      maxes,
      rawScore: raw,
      maxScore: max,
      total,
      internalScore,
      evidence,
      judgement: judgement(total, before, after, huntAvailable),
      sameServer: sameServer(before, after),
      noChange: sameGuildIdentity(before, after),
      huntAvailable,
      alternates: [],
    };
  }

  function judgement(score, before, after, huntAvailable) {
    if (sameGuildIdentity(before, after) && score >= 95) return { key: 'no-change', text: '변동없음' };
    if (!huntAvailable && score >= 80) return { key: 'possible', text: '참고: 토벌없음' };
    if (score >= 88) return { key: 'very-high', text: '매우 유력' };
    if (score >= 74) return { key: 'high', text: '유력' };
    if (score >= 58) return { key: 'possible', text: '가능성 있음' };
    return { key: 'low', text: '낮음' };
  }

  function candidateSort(a, b) {
    return b.internalScore - a.internalScore
      || b.total - a.total
      || Number(b.noChange) - Number(a.noChange)
      || Number(!b.sameServer) - Number(!a.sameServer)
      || a.before.guild_rank - b.before.guild_rank
      || a.after.guild_rank - b.after.guild_rank;
  }

  function buildMatches(beforePayload, afterPayload, options = {}) {
    const beforeAll = asList(beforePayload).map(normalizeGuild).sort((a, b) => a.guild_rank - b.guild_rank);
    const afterAll = asList(afterPayload).map(normalizeGuild).sort((a, b) => a.guild_rank - b.guild_rank);
    const beforeLimit = Number(options.beforeLimit || 200);
    const afterLimit = Number(options.afterLimit || 400);
    const beforeList = beforeLimit > 0 ? beforeAll.slice(0, beforeLimit) : beforeAll;
    const afterList = afterLimit > 0 ? afterAll.slice(0, afterLimit) : afterAll;
    const context = buildRarityContext(beforeList, afterList);

    const byBefore = new Map();
    const allCandidates = [];
    beforeList.forEach((before, beforeIndex) => {
      const row = [];
      afterList.forEach((after, afterIndex) => {
        const match = compareGuild(before, after, context);
        match.beforeIndex = beforeIndex;
        match.afterIndex = afterIndex;
        row.push(match);
        allCandidates.push(match);
      });
      row.sort(candidateSort);
      byBefore.set(beforeIndex, row);
    });

    allCandidates.sort(candidateSort);
    const usedBefore = new Set();
    const usedAfter = new Set();
    const matches = [];

    for (const candidate of allCandidates) {
      if (usedBefore.has(candidate.beforeIndex) || usedAfter.has(candidate.afterIndex)) continue;
      candidate.alternates = (byBefore.get(candidate.beforeIndex) || [])
        .filter(alt => alt.afterIndex !== candidate.afterIndex)
        .slice(0, 5)
        .map(alt => ({
          after: alt.after,
          total: alt.total,
          internalScore: alt.internalScore,
          judgement: alt.judgement,
          sameServer: alt.sameServer,
          noChange: alt.noChange,
          huntAvailable: alt.huntAvailable,
          alreadyUsed: usedAfter.has(alt.afterIndex),
        }));
      matches.push(candidate);
      usedBefore.add(candidate.beforeIndex);
      usedAfter.add(candidate.afterIndex);
      if (usedBefore.size >= beforeList.length) break;
    }

    matches.sort((a, b) => a.before.guild_rank - b.before.guild_rank);
    return {
      matches,
      beforeCount: beforeAll.length,
      afterCount: afterAll.length,
      comparedBefore: beforeList.length,
      comparedAfter: afterList.length,
      matchingMode: 'one-to-one',
      highLevelMin: TRACE_CONFIG.highLevelMin,
      huntThresholds: TRACE_CONFIG.huntThresholds,
    };
  }

  window.PrasiaCompare = { buildMatches, formatSnapshotId, serverName, normalizeGuild, toNumber, TRACE_CONFIG };
})();
