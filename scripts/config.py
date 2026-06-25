from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
SNAPSHOT_INDEX = DATA_DIR / "snapshots_index.json"

# 추적 기준: 92레벨 이상을 고급 지문으로 사용합니다.
HIGH_LEVEL_MIN = 92

# 토벌 지문 기준: 26+, 25+ 누적 카운트로 계산합니다.
# 예: hunt_level=26이면 26+와 25+에 모두 포함됩니다.
HUNT_THRESHOLDS = [26, 25]

CLASS_ALIASES = {
    "AbyssRevenant": "심연추방자",
    "Enforcer": "집행관",
    "SolarSentinel": "태양감시자",
    "RuneScribe": "주문각인사",
    "MirageBlade": "환영검사",
    "WildWarrior": "야만투사",
    "IncenseArcher": "향사수",
    "abyssrevenant": "심연추방자",
    "enforcer": "집행관",
    "solarsentinel": "태양감시자",
    "runescribe": "주문각인사",
    "mirageblade": "환영검사",
    "wildwarrior": "야만투사",
    "incensearcher": "향사수",
    "심연추방자": "심연추방자",
    "집행관": "집행관",
    "태양감시자": "태양감시자",
    "주문각인사": "주문각인사",
    "환영검사": "환영검사",
    "야만투사": "야만투사",
    "향사수": "향사수",
}
