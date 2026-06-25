Prasia_guild_Trace 92+ / 토벌25·26 스냅샷 생성 패치

덮어쓰기 파일:
- index.html
- css/style.css
- js/app.js
- js/compare.js
- js/mappings.js
- scripts/config.py
- scripts/fetch_rankings.py
- scripts/collect_snapshot.py
- scripts/run_snapshot.py
- .github/workflows/update_snapshot.yml

핵심 변경:
1. 새 스냅샷 생성 시 기준 레벨을 92+로 저장합니다.
2. Who_are_you.json / Who_are_you_class.json 안의 grade 값을 hunt_level로 병합합니다.
3. guilds.json 안에 아래 토벌 지문 필드가 생성됩니다.
   - hunt_threshold_distribution
   - hunt_distribution
   - class_hunt_distribution_92plus
   - level_class_hunt_distribution_92plus
   - has_hunt_data
   - hunt_member_count
4. 웹 비교는 양쪽 스냅샷 모두 토벌 데이터가 있을 때만 토벌 점수를 반영합니다.
5. 한쪽에만 토벌 데이터가 있으면 토벌 점수는 자동 제외됩니다.

주의:
- 이미 만들어진 과거 guilds.json에는 자동으로 토벌이 생기지 않습니다.
- 과거 원천 JSON이 있으면 use_existing=true로 해당 원천 JSON을 기준으로 스냅샷을 다시 만들어야 합니다.
