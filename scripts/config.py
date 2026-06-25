from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
SNAPSHOT_INDEX = DATA_DIR / "snapshots_index.json"
HIGH_LEVEL_MIN = 91

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
}
