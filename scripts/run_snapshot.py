# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def now_snapshot_id() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d_%H%M")


def run(cmd: list[str], title: str) -> None:
    print(f"\n[STEP] {title}")
    print("[CMD]", " ".join(cmd))
    result = subprocess.run([sys.executable, *cmd], cwd=str(ROOT), text=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="원천 랭킹 추출 후 스냅샷만 저장합니다. 비교는 웹에서 수행합니다.")
    parser.add_argument("--snapshot-id", default=now_snapshot_id(), help="예: 2026-06-25_1200. 비우면 현재 KST 시간")
    parser.add_argument("--use-existing", action="store_true", help="원천 랭킹 API 추출을 건너뛰고 data 폴더의 기존 JSON 사용")
    args = parser.parse_args()

    print(f"[ROOT] {ROOT}")
    if not args.use_existing:
        run([str(SCRIPTS / "fetch_rankings.py")], "원천 랭킹 데이터 추출")
    else:
        print("[SKIP] 기존 JSON을 사용합니다.")

    run([
        str(SCRIPTS / "collect_snapshot.py"),
        "--snapshot-id", args.snapshot_id,
        "--guild-source", "data/Who_are_you_guild_score.json",
    ], "시간별 스냅샷 저장")

    print("\n[OK] 완료")
    print("웹에서 이전/이후 스냅샷을 선택하면 즉시 비교됩니다.")


if __name__ == "__main__":
    main()
