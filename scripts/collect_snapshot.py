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
    from config import CLASS_ALIASES, DATA_DIR, HIGH_LEVEL_MIN, ROOT_DIR, SNAPSHOT_DIR, SNAPSHOT_INDEX
except ImportError:
    sys.path.append(str(Path(__file__).resolve().parent))
    from config import CLASS_ALIASES, DATA_DIR, HIGH_LEVEL_MIN, ROOT_DIR, SNAPSHOT_DIR, SNAPSHOT_INDEX


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
    with path.open("w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)


def pick(obj: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in obj and obj[key] not in (None, ""):
            return obj[key]
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


def server_value(item: Dict[str, Any]) -> str:
    return str(pick(item, "server", "world", "world_name", "server_name", default="-")).strip()


def guild_key(server: str, guild_name: str, guild_master: str = "") -> str:
    return "|".join([server.strip().lower(), guild_name.strip().lower(), guild_master.strip().lower()])


def fallback_key(guild_name: str, guild_master: str = "") -> str:
    return "|".join([guild_name.strip().lower(), guild_master.strip().lower()])


def normalize_guild(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    level_counts = pick(item, "level_counts", "level_distribution", default={}) or {}
    level_counts = {str(k): int(v or 0) for k, v in level_counts.items() if str(k).isdigit() and int(v or 0) > 0}
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
    try:
        level = int(float(pick(item, "level", "character_level", "gc_level", default=0) or 0))
    except (TypeError, ValueError):
        level = 0
    return {
        "server": server_value(item),
        "guild_name": guild_name,
        "guild_master": str(pick(item, "guild_master", "master", "master_name", default="")).strip(),
        "nickname": str(pick(item, "nickname", "name", "character_name", "gc_name", default="-")).strip(),
        "level": level,
        "class": normalize_class(pick(item, "class", "class_name", "ranking_class_name", "job", "character_class", "classCode", default="")),
        "rank": pick(item, "rank", "ranking", default=None),
    }


def attach_members(guilds: List[Dict[str, Any]], members: Iterable[Dict[str, Any]]) -> None:
    by_key: Dict[str, Dict[str, Any]] = {}
    by_fallback: Dict[str, Dict[str, Any]] = {}
    for guild in guilds:
        by_key[guild_key(guild["server"], guild["guild_name"], guild["guild_master"])] = guild
        by_fallback[fallback_key(guild["guild_name"], guild["guild_master"])] = guild
        by_fallback[fallback_key(guild["guild_name"])] = guild

    seen_members: set[tuple[str, str, str, int, str]] = set()
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
        if guild:
            normalized["is_master"] = normalized["nickname"] == guild.get("guild_master")
            unique_key = (guild["server"], guild["guild_name"], normalized["nickname"], normalized["level"], normalized["class"])
            if unique_key in seen_members:
                continue
            seen_members.add(unique_key)
            guild["members"].append(normalized)


def build_profile(guild: Dict[str, Any]) -> Dict[str, Any]:
    members = [m for m in guild.get("members", []) if int(m.get("level") or 0) >= HIGH_LEVEL_MIN]
    members.sort(key=lambda m: (not bool(m.get("is_master")), -int(m.get("level") or 0), str(m.get("nickname") or "")))

    level_distribution = Counter()
    class_distribution = Counter()
    level_class_distribution: Dict[str, Counter] = defaultdict(Counter)

    if members:
        for member in members:
            level = str(member.get("level"))
            cls = normalize_class(member.get("class"))
            level_distribution[level] += 1
            class_distribution[cls] += 1
            level_class_distribution[level][cls] += 1
    else:
        for level, count in (guild.get("level_counts") or {}).items():
            if int(level) >= HIGH_LEVEL_MIN:
                level_distribution[str(level)] += int(count or 0)

    high_level_count = sum(level_distribution.values())
    max_level = max([int(x) for x in level_distribution.keys()], default=None)
    return {
        "high_level_count": high_level_count,
        "max_level": max_level,
        "level_distribution": dict(sorted(level_distribution.items(), key=lambda x: int(x[0]), reverse=True)),
        "class_distribution": dict(class_distribution.most_common()),
        "level_class_distribution": {
            level: dict(counter.most_common())
            for level, counter in sorted(level_class_distribution.items(), key=lambda x: int(x[0]), reverse=True)
        },
        "members": members,
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
    parser = argparse.ArgumentParser(description="랭킹 데이터를 시간별 스냅샷으로 저장합니다.")
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

    for guild in guilds:
        guild.update(build_profile(guild))

    guilds.sort(key=lambda g: int(g.get("guild_rank") or 999999))
    out_dir = SNAPSHOT_DIR / args.snapshot_id
    payload = {
        "meta": {
            "snapshot_id": args.snapshot_id,
            "label": snapshot_label(args.snapshot_id),
            "created_at": created_at,
            "high_level_min": HIGH_LEVEL_MIN,
            "guild_count": len(guilds),
            "member_sources": [src for src in member_sources if (ROOT_DIR / src).exists()],
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


if __name__ == "__main__":
    main()
