# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

try:
    from config import CLASS_ALIASES, DATA_DIR, HIGH_LEVEL_MIN, HUNT_THRESHOLDS, ROOT_DIR, SNAPSHOT_DIR, SNAPSHOT_INDEX
except ImportError:
    sys.path.append(str(Path(__file__).resolve().parent))
    from config import CLASS_ALIASES, DATA_DIR, HIGH_LEVEL_MIN, HUNT_THRESHOLDS, ROOT_DIR, SNAPSHOT_DIR, SNAPSHOT_INDEX


def now_snapshot_id() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d_%H%M")


def snapshot_label(snapshot_id: str) -> str:
    try:
        return datetime.strptime(snapshot_id, "%Y-%m-%d_%H%M").strftime("%Y-%m-%d %H:%M")
    except Exception:
        return snapshot_id.replace("_", " ")


def read_json(source: str | Path) -> Any:
    path = Path(source)
    if not path.is_absolute():
        path = ROOT_DIR / path
    if not path.exists():
        raise FileNotFoundError(f"JSON 원본 파일을 찾지 못했습니다: {path}")
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    tmp.replace(path)


def pick(obj: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in obj and obj[key] not in (None, ""):
            return obj[key]
    return default


def to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def normalize_class(value: Any) -> str:
    text = str(value or "").strip()
    return CLASS_ALIASES.get(text, text or "미확인")


def as_list(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("rankings", "data", "items", "guilds", "characters", "ranking"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
    return []


def server_from_world_id(world_id: Any) -> str:
    text = str(world_id or "")
    # LIVE_W05_R1 -> 5-1
    import re
    m = re.search(r"LIVE_W(\d+)_R(\d+)", text, re.I)
    if not m:
        return ""
    return f"{int(m.group(1))}-{int(m.group(2))}"


def server_value(item: Dict[str, Any]) -> str:
    value = pick(item, "server", "world", "world_name", "server_name", default="")
    value = str(value or "").strip()
    if value:
        return value
    return server_from_world_id(pick(item, "world_id", "worldId", default="")) or "-"


def guild_key(server: str, guild_name: str, guild_master: str = "") -> str:
    return "|".join([server.strip().lower(), guild_name.strip().lower(), guild_master.strip().lower()])


def fallback_key(guild_name: str, guild_master: str = "") -> str:
    return "|".join([guild_name.strip().lower(), guild_master.strip().lower()])


def normalize_hunt_level(item: Dict[str, Any]) -> Optional[int]:
    # grade는 프라시아 랭킹 원천에서 토벌 단계로 들어오는 값입니다.
    candidates = [
        "hunt_level",
        "huntLevel",
        "grade",
        "subjugation_level",
        "subjugationLevel",
        "raid_level",
        "raidLevel",
        "boss_level",
        "bossLevel",
        "boss_clear_level",
        "bossClearLevel",
        "content_level",
        "contentLevel",
        "tobul_level",
        "tobulLevel",
        "토벌레벨",
        "토벌",
    ]
    for key in candidates:
        if key in item and item[key] not in (None, ""):
            value = to_int(item[key], 0)
            if value > 0:
                return value
    return None


def normalize_guild(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    level_counts = pick(item, "level_counts", "level_distribution", default={}) or {}
    level_counts = {
        str(k): int(v or 0)
        for k, v in level_counts.items()
        if str(k).isdigit() and int(v or 0) > 0
    }
    return {
        "server": server_value(item),
        "world_group_id": pick(item, "world_group_id", default=""),
        "world_id": pick(item, "world_id", default=""),
        "guild_name": str(pick(item, "guild_name", "guild", "guildName", default="-")).strip(),
        "guild_master": str(pick(item, "guild_master", "master", "master_name", "guildMaster", default="-")).strip(),
        "guild_rank": int(pick(item, "rank", "ranking", "guild_rank", "previous_rank", default=index + 1) or index + 1),
        "guild_score": float(pick(item, "score", "guild_score", "previous_score", default=0) or 0),
        "guild_level": pick(item, "guild_level", default=None),
        "guild_member_count": pick(item, "guild_member_count", "member_count", default=None),
        "max_guild_member_count": pick(item, "max_guild_member_count", default=None),
        "level_counts": level_counts,
        "members": [],
    }


def normalize_member(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    guild_name = str(pick(item, "guild_name", "guild", "guildName", default="")).strip()
    if not guild_name:
        return None
    level = to_int(pick(item, "level", "character_level", "gc_level", default=0), 0)
    nickname = str(pick(item, "nickname", "name", "character_name", "gc_name", default="-")).strip()
    cls = normalize_class(pick(item, "class", "class_name", "ranking_class_name", "job", "character_class", "classCode", default=""))
    hunt_level = normalize_hunt_level(item)
    return {
        "server": server_value(item),
        "guild_name": guild_name,
        "guild_master": str(pick(item, "guild_master", "master", "master_name", default="")).strip(),
        "nickname": nickname,
        "level": level,
        "class": cls,
        "rank": pick(item, "rank", "ranking", default=None),
        "hunt_level": hunt_level,
        # 원본 확인용으로 grade도 남겨둡니다. 없으면 null.
        "grade": hunt_level,
    }


def attach_members(guilds: List[Dict[str, Any]], members: Iterable[Dict[str, Any]]) -> None:
    by_key: Dict[str, Dict[str, Any]] = {}
    by_fallback: Dict[str, Dict[str, Any]] = {}
    for guild in guilds:
        by_key[guild_key(guild["server"], guild["guild_name"], guild["guild_master"])] = guild
        by_fallback[fallback_key(guild["guild_name"], guild["guild_master"])] = guild
        by_fallback[fallback_key(guild["guild_name"])] = guild

    # 같은 멤버가 전체랭킹/직업별랭킹 양쪽에서 들어와도 하나로 병합합니다.
    # 기존 멤버에 토벌값이 없고 새 멤버에 있으면 토벌값을 채웁니다.
    member_maps: Dict[int, Dict[tuple[str, int, str], Dict[str, Any]]] = defaultdict(dict)

    for member in members:
        normalized = normalize_member(member)
        if not normalized:
            continue
        candidates = [
            guild_key(normalized["server"], normalized["guild_name"], normalized.get("guild_master", "")),
            fallback_key(normalized["guild_name"], normalized.get("guild_master", "")),
            fallback_key(normalized["guild_name"]),
        ]
        guild = None
        for key in candidates:
            guild = by_key.get(key) or by_fallback.get(key)
            if guild:
                break
        if not guild:
            continue

        normalized["is_master"] = normalized["nickname"] == guild.get("guild_master")
        unique_key = (normalized["nickname"], normalized["level"], normalized["class"])
        bucket = member_maps[id(guild)]
        previous = bucket.get(unique_key)
        if previous:
            if previous.get("hunt_level") in (None, "") and normalized.get("hunt_level") not in (None, ""):
                previous["hunt_level"] = normalized.get("hunt_level")
                previous["grade"] = normalized.get("hunt_level")
            if normalized.get("is_master"):
                previous["is_master"] = True
            continue
        bucket[unique_key] = normalized
        guild["members"].append(normalized)


def add_count(counter: Dict[str, int], key: str, inc: int = 1) -> None:
    counter[key] = counter.get(key, 0) + inc


def distribution_from_members(members: List[Dict[str, Any]]) -> Dict[str, Any]:
    level_distribution = Counter()
    class_distribution = Counter()
    level_class_distribution: Dict[str, Counter] = defaultdict(Counter)
    hunt_threshold_distribution: Counter = Counter()
    class_hunt_distribution: Counter = Counter()
    level_class_hunt_distribution: Counter = Counter()
    hunt_member_count = 0

    for member in members:
        level_int = to_int(member.get("level"), 0)
        if level_int <= 0:
            continue
        level = str(level_int)
        cls = normalize_class(member.get("class"))
        level_distribution[level] += 1
        class_distribution[cls] += 1
        level_class_distribution[level][cls] += 1

        hunt_level = normalize_hunt_level(member)
        if hunt_level is not None:
            hunt_member_count += 1
            member["hunt_level"] = hunt_level
            member["grade"] = hunt_level
            for threshold in HUNT_THRESHOLDS:
                if hunt_level >= threshold:
                    bucket = f"{threshold}+"
                    hunt_threshold_distribution[bucket] += 1
                    class_hunt_distribution[f"{cls}|{bucket}"] += 1
                    level_class_hunt_distribution[f"{level}|{cls}|{bucket}"] += 1

    level_dist = dict(sorted(level_distribution.items(), key=lambda x: int(x[0]), reverse=True))
    class_dist = dict(class_distribution.most_common())
    level_class_dist = {
        level: dict(counter.most_common())
        for level, counter in sorted(level_class_distribution.items(), key=lambda x: int(x[0]), reverse=True)
    }
    return {
        "level_distribution": level_dist,
        "class_distribution": class_dist,
        "level_class_distribution": level_class_dist,
        "hunt_distribution": dict(hunt_threshold_distribution.most_common()),
        "class_hunt_distribution": dict(class_hunt_distribution.most_common()),
        "level_class_hunt_distribution": dict(level_class_hunt_distribution.most_common()),
        "hunt_member_count": hunt_member_count,
    }


def existing_levels(guild: Dict[str, Any], members: List[Dict[str, Any]]) -> List[int]:
    levels = set()
    for member in members:
        level = to_int(member.get("level"), 0)
        if level > 0:
            levels.add(level)
    for level, count in (guild.get("level_counts") or {}).items():
        if str(level).isdigit() and int(count or 0) > 0:
            levels.add(int(level))
    return sorted(levels, reverse=True)


def level_count_distribution(guild: Dict[str, Any], levels: Iterable[int]) -> Dict[str, int]:
    allowed = {str(level) for level in levels}
    out: Dict[str, int] = {}
    for level, count in (guild.get("level_counts") or {}).items():
        if str(level) in allowed and int(count or 0) > 0:
            out[str(level)] = int(count or 0)
    return dict(sorted(out.items(), key=lambda x: int(x[0]), reverse=True))


def select_match_levels(guild: Dict[str, Any], members: List[Dict[str, Any]]) -> tuple[str, List[int]]:
    levels = existing_levels(guild, members)
    if not levels:
        return "no_level_data", []
    high_levels = [level for level in levels if level >= HIGH_LEVEL_MIN]
    if high_levels:
        return "92plus", high_levels
    return "top3_existing_levels", levels[:3]


def build_profile(guild: Dict[str, Any]) -> Dict[str, Any]:
    raw_members = [m for m in guild.get("members", []) if to_int(m.get("level"), 0) > 0]
    raw_members.sort(key=lambda m: (not bool(m.get("is_master")), -to_int(m.get("level"), 0), str(m.get("nickname") or "")))

    base_members = [m for m in raw_members if to_int(m.get("level"), 0) >= HIGH_LEVEL_MIN]
    base_dist = distribution_from_members(base_members)

    base_level_dist = base_dist["level_distribution"]
    if not base_level_dist:
        base_level_dist = level_count_distribution(guild, [level for level in existing_levels(guild, raw_members) if level >= HIGH_LEVEL_MIN])

    match_rule, match_levels = select_match_levels(guild, raw_members)
    match_level_set = set(match_levels)
    match_members = [m for m in raw_members if to_int(m.get("level"), 0) in match_level_set]
    match_dist = distribution_from_members(match_members)
    match_level_dist = match_dist["level_distribution"]
    if not match_level_dist:
        match_level_dist = level_count_distribution(guild, match_levels)

    all_levels = existing_levels(guild, raw_members)
    high_level_count = sum(base_level_dist.values())
    match_member_count = sum(match_level_dist.values()) if match_level_dist else len(match_members)

    return {
        "high_level_min": HIGH_LEVEL_MIN,
        "high_level_count": high_level_count,
        "high_level_count_92plus": high_level_count,
        "max_level": max(all_levels, default=None),
        "level_distribution": base_level_dist,
        "level_distribution_92plus": base_level_dist,
        "class_distribution": base_dist["class_distribution"],
        "class_distribution_92plus": base_dist["class_distribution"],
        "level_class_distribution": base_dist["level_class_distribution"],
        "level_class_distribution_92plus": base_dist["level_class_distribution"],
        "hunt_threshold_distribution": base_dist["hunt_distribution"],
        "hunt_distribution": base_dist["hunt_distribution"],
        "class_hunt_distribution": base_dist["class_hunt_distribution"],
        "class_hunt_distribution_92plus": base_dist["class_hunt_distribution"],
        "level_class_hunt_distribution": base_dist["level_class_hunt_distribution"],
        "level_class_hunt_distribution_92plus": base_dist["level_class_hunt_distribution"],
        "hunt_member_count": base_dist["hunt_member_count"],
        "has_hunt_data": base_dist["hunt_member_count"] > 0,
        "match_version": "trace_v1",
        "match_rule": match_rule,
        "match_high_level_min": HIGH_LEVEL_MIN,
        "match_levels": match_levels,
        "match_member_count": match_member_count,
        "match_has_member_data": len(match_members) > 0,
        "match_level_distribution": match_level_dist,
        "match_class_distribution": match_dist["class_distribution"],
        "match_level_class_distribution": match_dist["level_class_distribution"],
        "match_hunt_distribution": match_dist["hunt_distribution"],
        "match_class_hunt_distribution": match_dist["class_hunt_distribution"],
        "match_level_class_hunt_distribution": match_dist["level_class_hunt_distribution"],
        "members": match_members,
    }


def load_members(paths: List[str]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    for source in paths:
        path = ROOT_DIR / source if not Path(source).is_absolute() else Path(source)
        if not path.exists():
            continue
        merged.extend(as_list(read_json(path)))
    return merged


def update_indexes(snapshot_id: str, created_at: str) -> None:
    entry = {
        "id": snapshot_id,
        "label": snapshot_label(snapshot_id),
        "created_at": created_at,
        "path": f"data/snapshots/{snapshot_id}/guilds.json",
    }
    index = {"snapshots": []}
    if SNAPSHOT_INDEX.exists():
        try:
            index = json.loads(SNAPSHOT_INDEX.read_text(encoding="utf-8"))
        except Exception:
            pass
    snapshots = [x for x in index.get("snapshots", []) if x.get("id") != snapshot_id]
    snapshots.append(entry)
    snapshots.sort(key=lambda x: x.get("id", ""))
    out = {"updated_at": created_at, "snapshots": snapshots}
    write_json(SNAPSHOT_INDEX, out)
    write_json(SNAPSHOT_DIR / "manifest.json", out)


def main() -> None:
    parser = argparse.ArgumentParser(description="랭킹 데이터를 시간별 스냅샷으로 저장합니다. 92+ 및 토벌25/26 지문을 포함합니다.")
    parser.add_argument("--snapshot-id", default=now_snapshot_id(), help="예: 2026-06-25_1200")
    parser.add_argument("--guild-source", default="data/Who_are_you_guild_score.json")
    parser.add_argument("--member-source", action="append", default=[])
    args = parser.parse_args()

    created_at = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M:%S")
    guild_payload = read_json(args.guild_source)
    guilds = [normalize_guild(item, idx) for idx, item in enumerate(as_list(guild_payload))]

    default_member_sources = ["data/Who_are_you.json", "data/Who_are_you_class.json"]
    member_sources = args.member_source or default_member_sources
    attach_members(guilds, load_members(member_sources))

    match_stats: Dict[str, int] = defaultdict(int)
    match_member_data_count = 0
    for guild in guilds:
        guild.update(build_profile(guild))
        match_stats[str(guild.get("match_rule") or "unknown")] += 1
        if guild.get("match_has_member_data"):
            match_member_data_count += 1

    guilds.sort(key=lambda g: int(g.get("guild_rank") or 999999))
    out_dir = SNAPSHOT_DIR / args.snapshot_id
    payload = {
        "meta": {
            "snapshot_id": args.snapshot_id,
            "label": snapshot_label(args.snapshot_id),
            "created_at": created_at,
            "high_level_min": HIGH_LEVEL_MIN,
            "hunt_thresholds": HUNT_THRESHOLDS,
            "trace_version": "v1",
            "match_version": "trace_v1",
            "match_rule_summary": "기본 92+ 유지. 92+ 관측 레벨이 없으면 해당 결사의 실제 존재 상위 3개 레벨로 match_* 지문 생성.",
            "match_stats": dict(match_stats),
            "match_member_guild_count": match_member_data_count,
            "guild_count": len(guilds),
            "member_sources": [src for src in member_sources if (ROOT_DIR / src).exists()],
            "hunt_note": "member.grade 또는 hunt_level 계열 필드를 토벌 단계로 병합합니다.",
        },
        "guilds": guilds,
    }
    write_json(out_dir / "guilds.json", payload)
    write_json(out_dir / "snapshot_info.json", payload["meta"])
    write_json(DATA_DIR / "latest_guilds.json", payload)
    update_indexes(args.snapshot_id, created_at)
    print(f"[OK] snapshot saved: {out_dir}")
    print(f"[OK] snapshot label: {snapshot_label(args.snapshot_id)}")
    print(f"[OK] guild count: {len(guilds):,}")
    print(f"[OK] high level min: {HIGH_LEVEL_MIN}+")
    print(f"[OK] hunt thresholds: {HUNT_THRESHOLDS}")


if __name__ == "__main__":
    main()
