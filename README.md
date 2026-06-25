# Prasia_guild_Trace

프라시아 전기 결사 이동 추적용 스냅샷 기반 웹 페이지입니다.

이번 구조는 비교 결과 JSON을 미리 만들지 않습니다. Python/GitHub Actions는 시간별 스냅샷만 저장하고, 웹에서 이전/이후 스냅샷을 선택하면 브라우저에서 즉시 비교합니다.

## 구조

```text
Prasia_guild_Trace/
├─ index.html
├─ css/style.css
├─ js/app.js
├─ js/compare.js
├─ js/mappings.js
├─ data/snapshots_index.json
├─ data/snapshots/
├─ scripts/fetch_rankings.py
├─ scripts/collect_snapshot.py
├─ scripts/run_snapshot.py
└─ .github/workflows/update_snapshot.yml
```

## GitHub Secret 설정

랭킹 API를 GitHub Actions에서 호출하려면 레포에 Secret을 등록해야 합니다.

```text
Settings → Secrets and variables → Actions → New repository secret
Name: PRASIA_API_TOKEN
Secret: 토큰 값
```

`Bearer` 문구는 넣지 말고 토큰 본문만 넣는 것을 권장합니다.

## 수동 실행

GitHub에서:

```text
Actions → Update Snapshot → Run workflow
```

입력값:

```text
snapshot_id: 2026-06-25_1200
use_existing: false
```

`use_existing=false`는 원천 랭킹 API를 새로 호출합니다.
`use_existing=true`는 이미 data 폴더에 있는 JSON을 사용해 스냅샷만 다시 만듭니다.

## 로컬 실행

```bash
pip install requests
python scripts/run_snapshot.py --snapshot-id 2026-06-25_1200
```

기존 JSON으로만 스냅샷을 만들려면:

```bash
python scripts/run_snapshot.py --snapshot-id 2026-06-25_1200 --use-existing
```

## 웹 사용법

1. 여러 시간대의 스냅샷을 저장합니다.
2. 웹에서 이전 데이터와 이후 데이터를 선택합니다.
3. [비교하기]를 누르면 즉시 유사성 검사와 점수 대조가 실행됩니다.

## 비교 기준

- 결사장 닉네임
- 91레벨 이상 총 인원 수
- 91레벨 이상 레벨 분포
- 91레벨 이상 직업군 분포
- 91레벨 이상 레벨별 직업군 분포
- 결사 순위 점수 근접도
- 결사명 보너스

일반 결사원 닉네임은 유사도 점수에 사용하지 않고, 상세 보기 참고용으로만 표시합니다.
