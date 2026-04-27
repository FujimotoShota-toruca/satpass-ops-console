# SatPass Ops Console

SatPass Ops Console は、TLE と地上局情報を YAML で登録し、ブラウザ上で衛星の地上軌跡、可視範囲、地上局から見た方位角・仰角、直近可視パス、日照/蝕、ドップラーシフト計画値を表示/出力するフロントエンド完結型の実験アプリです。

既存の `tle_pass_csv_exporter` と同じ運用思想に寄せ、TLE を YAML に直接書き、指定日の AOS〜LOS 区間をパスごとに分けて CSV ZIP 出力できます。

## できること

- YAML による TLE・地上局・周波数・表示設定の一括管理
- 分割 YAML による `settings` / `ground_stations` / `satellites` / `doppler` / `map` / `radar` / `orbit_track` / `tle_sources` 管理
- 複数衛星・複数地上局の登録
- CelesTrak等のTLE URLからの一括TLE取得・更新
- SGP4 によるリアルタイム衛星位置表示
- 地図上での衛星直下点、地上軌跡、簡易フットプリント表示
- Mercator / equirectangular 表示切替
- Wikimedia衛星地図をデフォルト背景にした地図表示
- 推奨地図URLプリセット、ローカル地図画像アップロード、同梱SVG地図
- 地上局から見た Azimuth / Elevation / Range の表示
- レーダーチャートへのスカイライン背景画像の重ね合わせ
- 7セグ風の大型リアルタイム表示
- 直近可視パス一覧
- レーダーチャート上での次回可視パス軌跡表示と、パス中の現在位置マーカー表示
- 表示衛星チェックボックスによる地図表示対象の選択
- `Split` / `Radar focus` / `Map focus` による上部表示領域の切替
- 軌道上の `SUNLIT` / `PENUMBRA` / `UMBRA` 判定と軌道線の色分け
- 地上局の `DAY` / `TWILIGHT` / `NIGHT` 判定
- 指定日1日分のパス別 Doppler CSV ZIP 出力
- GitHub Pages への静的デプロイ

## 画面レイアウト

運用画面を優先するため、設定系UIは常時表示せず、上部の `YAML Setup` ボタンから開くモーダルウィンドウに集約しています。

通常画面は以下の構成です。

1. Doppler CSV Output
2. リアルタイム情報表示板
3. 地図 / レーダーチャート
4. Visible Passes
5. Detailed Information

YAML Import/Export、Quick Satellite Add、表示系詳細設定、YAMLエディタは `YAML Setup` ウィンドウ内に置いています。対象衛星選択、地上局選択、表示衛星選択は運用画面側で操作できます。設定の正本は引き続きYAMLです。


## 運用手順とYAML仕様

- `OperationalPreparationProcedures.md`: 運用準備手順。YAML一括設定、Visible Passes、Ops予約、Doppler CSV出力の手順を記載。
- `YamlSpecification.md`: YAML仕様書。`satellites` / `tle_sources` / `ground_stations` / `doppler` などの形式を記載。
- `config/minimal_iss_operation.yaml`: 追尾衛星のTLE本文まで含めた最小構成例。
- `config/kakushin_rising_url_operation.yaml`: KAKUSHIN RISING系TLE URLを使う構成例。

Quick Satellite Add欄は、YAMLを作り直さずに一時的に衛星を追加する補助機能です。通常運用では、最初からYAMLの `satellites[].tle` に対象衛星のTLEを入れて読み込む構成を推奨します。

## セットアップ

```bash
npm install
npm run dev
```

ビルド確認:

```bash
npm run build
```

## YAML 設定例

`config/config_example.yaml`、`config/minimal_iss_operation.yaml`、`config/kakushin_rising_url_operation.yaml` を参照してください。YAML仕様は `YamlSpecification.md` にまとめています。

```yaml
settings:
  input_root: ./
  output_root: ../output
  observation_date: 2026-04-25
  folder_name: test_ops
  timezone: Asia/Tokyo
  min_elevation_deg: 0.0

doppler:
  uplink_base_frequency_hz: 2036250000
  downlink_base_frequency_hz: 2201000000

ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.5551
    longitude_deg: 139.8828
    altitude_m: 120.0
    min_elevation_deg: 0.0

satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000

app:
  title: SatPass Ops Console
  refresh_sec: 1
  prediction_horizon_hours: 12
  prediction_step_sec: 30
  track_minutes_before: 45
  track_minutes_after: 90
  track_step_sec: 60

map:
  projection: equirectangular
  background_image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Equirectangular-projection.jpg?width=2048"
  background_opacity: 0.78
  attribution: Wikimedia Commons Equirectangular projection / NASA imagery derivative
  show_synthetic_land: false
  show_grid: true

radar:
  background_image_url: ""
  background_opacity: 0.45
  attribution: ""

orbit_track:
  color_mode: sunlight
  sunlit_color: "#22c55e"
  penumbra_color: "#f59e0b"
  umbra_color: "#7c3aed"
  default_color: satellite
  show_eclipse_label: true
```

## 分割 YAML

`config/split/` 以下に分割テンプレートを同梱しています。画面上部の `Import YAML(s)/JSON` では複数ファイルを同時選択できます。

```text
config/split/
├─ settings.yaml
├─ ground_stations.yaml
├─ satellites.yaml
├─ doppler.yaml
├─ map.yaml
├─ radar.yaml
├─ orbit_track.yaml
└─ tle_sources.yaml
```

## TLE URL からの一括取得

`tle_sources` に `name@url` 形式でTLE取得元を列挙すると、`YAML Setup / Add Satellite` 内の `Fetch YAML URLs` から一括取得できます。CelesTrak の `gp.php` URLでは、ブラウザで扱いやすいように `http://www.celestrak.org` を `https://celestrak.org` に補正し、`FORMAT=TLE` がない場合は自動付与します。

```yaml
tle_sources: |
  ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
```

`TLE URL YAML` ボタンから、汎用のTLE URLテンプレートをダウンロードできます。特定ミッションの衛星群は、YAMLに `tle_sources` を追加するか、TLE入力欄へ `name@url` 形式で貼り付けて `Add & Fetch` を押してください。

配列形式も使えます。

```yaml
tle_sources:
  - name: ISS (ZARYA)
    url: https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
  - name: RAISE-4
    catnr: 67073
```

`CATNR`が分かっている場合は、`satellites` 側へ `catnr` または `tle_url` を置く運用も可能です。

```yaml
satellites:
  - id: iss
    name: ISS (ZARYA)
    catnr: 25544
  - id: raise-4
    name: RAISE-4
    tle_url: https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE
```

KAKUSHIN RISING OBJECT A-H などの専用URL群は、ルートの `OperationalPreparationProcedures.md` に記載しています。アプリ自体は一般用途向けとして、専用の自動追加ボタンは置いていません。
## Doppler CSV ZIP 出力

画面上部またはパス一覧パネル内の `Pass CSV ZIP` / `Export Pass CSV ZIP` を押すと、指定日の可視パスを抽出し、ZIP を生成します。

出力構成例:

```text
20260425_test_ops_doppler_csv.zip
└─ 20260425_test_ops/
   ├─ ISS_ZARYA_20260425_AOS051233_uplink.csv
   ├─ ISS_ZARYA_20260425_AOS051233_downlink.csv
   ├─ config_used.yaml
   └─ manifest.txt
```

CSV はヘッダなしで、各行は以下です。

```text
[時刻],[周波数(ドップラー補正済みHz)],[方位角deg],[仰角deg]
```

ドップラー補正の符号規約は次です。

- `range_rate > 0`: 衛星が地上局から遠ざかる
- Downlink: `f_down = f0 * (1 - v_r / c)`
- Uplink: `f_up = f0 / (1 - v_r / c)`

v0.15.0 以降の range rate は、既存の `tle_pass_csv_exporter.py` に合わせて、topocentric position / velocity のLOS方向射影で計算します。すなわち、レンジの中心差分ではなく、`range_rate = dot(r, v) / |r|` を用います。ブラウザ版では satellite.js のSGP4/TEME近似とGMST変換を使うため、Skyfield版と完全一致するとは限りませんが、ドップラー計算ロジックとCSV桁数は既存ツールへ寄せています。

## 地図画像

画面右下の `Map preset` から、同梱地図または外部URL地図を選択できます。YAML の `map.background_image_url` に任意の画像URLを入れることもできます。

```yaml
map:
  projection: equirectangular
  background_image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Equirectangular-projection.jpg?width=2048"
  background_opacity: 0.78
  attribution: Wikimedia Commons Equirectangular projection / NASA imagery derivative
  show_synthetic_land: false
  show_grid: true
```

背景画像の投影法と `projection` は必ず一致させてください。地上軌跡の計算は投影法に依存しませんが、画像と投影法が一致しないと見た目がずれます。

## レーダーチャート背景画像

`radar.background_image_url` に地上局から見たスカイライン画像を指定できます。画面上の `Upload skyline` からローカル画像を読み込むこともできます。画像は方位・仰角グリッドと重ねるため、正方形画像を推奨します。

```yaml
radar:
  background_image_url: ""
  background_opacity: 0.45
  attribution: ""
```

## 軌道上日照による軌道線色分け

`orbit_track.color_mode: sunlight` の場合、軌道プロットは軌道上日照で色分けされます。地上局の日照状態とは独立です。

```yaml
orbit_track:
  color_mode: sunlight
  sunlit_color: "#22c55e"
  penumbra_color: "#f59e0b"
  umbra_color: "#7c3aed"
  default_color: satellite
  show_eclipse_label: true
```

## 日照・蝕判定

衛星蝕判定は、衛星から見た地球視半径と太陽視半径、および太陽・地球中心方向の離角から `SUNLIT` / `PENUMBRA` / `UMBRA` を判定します。旧版の円筒影近似よりは運用検討に向きます。

ただし太陽位置は軽量な近似式で、時系・地球姿勢・EOP・高精度暦までは含めていません。運用最終値に使う場合は Orekit 等でクロスチェックしてください。

## GitHub Pages デプロイ

このリポジトリには `.github/workflows/deploy-pages.yml` を同梱しています。

1. GitHub に push
2. Repository Settings → Pages
3. Source を `GitHub Actions` に設定
4. Actions の `Deploy to GitHub Pages` が完了するのを待つ

## 技術構成

- React
- Vite
- satellite.js
- js-yaml
- jszip
- SVG map / SVG radar chart

## 制約

このMVPはブラウザ上で完結する簡易運用支援アプリです。TLE/SGP4ベースの可視パス計算・CSV計画値生成には使えますが、実局運用の最終値としては、別実装とのクロスチェック、実測TLE更新、時刻同期、地上局機材仕様、送受信機の設定範囲確認が必要です。

## v8 updates

- 地図上に表示する衛星をチェックボックスで選択できます。追跡対象の衛星と、地図上に表示する衛星は独立です。
- 上部ダッシュボードに選択中の衛星名を明示しました。
- `LOCAL TIME` は設定タイムゾーンの時刻を表示し、サブ表示に UTC 時刻を併記します。
- 旧 `ORBIT SUN` 表示を運用向けの `PASS TIMER` に変更しました。非パス時は次回 AOS まで、パス中は LOS までのカウントダウンを表示します。
- レーダーチャートには次回可視パスの Az/El 軌跡を常時表示します。パス中は現在位置マーカーも表示されます。
- `Next Visible Passes` は AOS / MaxEL 時刻 / LOS / MaxEL 角度 / MaxEL 時レンジを表示します。
- Doppler CSV ZIP は従来どおり、選択中の衛星×選択中の地上局に対して出力します。


## v0.10.0 updates

- Split view now places the map on the left and the radar chart on the right.
- The pass table rows can be clicked to pin/unpin the radar plot for that pass.
- Radar pass plots use solid lines for sunlit segments and dashed lines for penumbra/umbra segments.
- Markers for all map-displayed satellites are also shown on the radar chart.
- Night-side shading was darkened, and a dash-dot terminator line was added to the map.
- Doppler CSV ZIP export buttons were made more visually prominent.

## v0.11.0 updates

- Doppler CSV ZIP export can now target an arbitrary `CSV date` from the pass table controls.
- `Next Visible Passes` prediction window can be switched between `Today`, `12h`, `24h`, `48h`, and `72h`.
- Multiple pass rows can be selected at the same time; selected rows are overlaid on the radar chart and can be toggled by clicking again.
- Radar chart pass summary cards were removed to give the radar plot and legend more screen area.
- A clock offset control was added. Positive or negative minute offsets can be applied to the real-time display and propagation time.

## v0.13.1 updates

- Fixed a build error caused by an unterminated newline string in the pass text-copy formatter.

## v0.13.0 updates

- `Next Visible Passes` と Doppler CSV 出力操作を分離しました。
- Doppler CSV 出力は画面上部の小型 `DOPPLER CSV OUTPUT` パネルに集約しました。
- `Next Visible Passes` はパス予測・レーダープロット選択に専念し、CSV date / export ボタンを削除しました。
- 上部ヘッダーは実行制御系だけに整理し、YAML/設定系ボタンは下段の設定領域へ移動しました。
- Doppler CSV ZIP は従来どおり、選択中の衛星×選択中の地上局×指定CSV日付を対象に出力します。


## v0.13.2 build fix

- Pin `satellite.js` to `5.0.0` to avoid the newer WASM/pthreads build path being pulled into Vite production builds.
- Pin Vite/React/js-yaml/jszip versions instead of using `latest`, so GitHub Pages/Netlify builds are reproducible.
- If an older `package-lock.json` exists, delete `node_modules` and `package-lock.json`, then run `npm install` again.

## Privacy / Data Flow

このアプリは静的フロントエンドアプリとして動作します。バックエンドサーバ、DB、ログイン機能、テレメトリ収集機能は含めていません。

ローカルPCから読み込んだ YAML、画面上で編集した YAML、ローカルからアップロードした地図画像・スカイライン画像、生成した Doppler CSV ZIP は、基本的にブラウザ内で処理されます。これらをアプリ側からGitHubや外部サーバへアップロードする処理は入れていません。

ただし、次の場合は外部通信が発生します。

- `Fetch / Update TLE` を押した場合、`tle_sources` や `satellites[].tle_url` に書かれたTLE取得URLへブラウザからGETリクエストを送ります。
- `map.background_image_url` に外部画像URLを指定した場合、その地図画像をブラウザが読み込みます。
- `radar.background_image_url` に外部画像URLを指定した場合、その背景画像をブラウザが読み込みます。
- `GitHub` ボタンを押した場合、GitHubリポジトリを別タブで開きます。

現在の設定は再読み込み後も復元できるように、ブラウザの `localStorage` に保存されます。これはPC・ブラウザプロファイル内の保存であり、外部サーバ保存ではありません。ただし、共用PCでは同じブラウザを使う別ユーザーに設定が見える可能性があります。

画面内の `Clear Local Config` ボタンを押すと、SatPass Ops Console が保存した `localStorage` の設定キーを削除できます。削除前に現在設定を残したい場合は `Export YAML` を使ってください。

詳細は `docs/PRIVACY_DATA_FLOW.md` を参照してください。

## v0.14.0

- アプリ画面からGitHubリポジトリを開ける `GitHub` ボタンを追加
- ブラウザ内に保存された設定を削除する `Clear Local Config` ボタンを追加
- README と `docs/PRIVACY_DATA_FLOW.md` にデータフローと外部通信範囲を明記
- localStorage 保存キーを `web-orbitron:config-yaml-v14` に更新し、旧キーも読み込み対象に維持


## v0.15.0

- Doppler CSV の range rate 計算を、レンジ中心差分から topocentric position / velocity のLOS方向射影へ変更しました。
- `tle_pass_csv_exporter.py` の `range_rate_mps = 1000 * dot(r_km, v_kmps) / |r_km|` に合わせる方針です。
- Doppler CSV の方位角・仰角出力を小数6桁へ変更しました。
- `manifest.txt` に range rate method を記録するようにしました。


## v0.16.0 updates

- Map orbit legend is placed outside the map canvas to avoid covering ground tracks.
- Visible Passes now supports a default `1Day` mode with a date picker.
- One operation pass can be selected independently from radar plot selection.
- `PASS TIMER` uses the selected operation pass when one is selected; otherwise it falls back to the next/active pass.


## v0.17.0 UI update

- Doppler CSV Output を全幅の操作ストリップとして再配置しました。
- 衛星名・地上局名・日付選択・ZIP出力ボタンが100%表示時にも潰れにくいよう、チップ表示と折り返しレイアウトに変更しました。

## v0.18.0 update

- Visible Passes の Ops 列を、PASS TIMER 用の運用予約トグルとして明確化しました。
- Ops 予約は pass index ではなく AOS/LOS/MaxEL 由来の安定キーで管理します。
- 予約済みパスがある場合、PASS TIMER はそのパスの AOS/LOS/DONE を優先表示します。
- Radar Chart は可視区間だけでなく、AOS/LOS 前後の非可視側を破線で表示します。
- Radar Chart の日照区間は実線、蝕区間は破線、非可視側は薄い破線で表示します。

## v0.19.0 note

`Visible Passes` の `Ops` 列は複数選択に対応しています。予約済みパスがある場合、`PASS TIMER` は予約順に次の運用パスを対象にします。`Text Copy` では各パスに `[運用]` / `[非運用]` が付与されます。


## v0.20.0

- URL取得型YAMLを読み込んだ直後に衛星表示が空になる問題を回避しました。
- TLE URLのみの設定では、Fetch / Update TLE 実行前にデフォルトTLEを暫定表示します。
- 設定適用メッセージに、TLE URL取得が必要な場合の案内を追加しました。

## v0.21.0 UI update

- Added a top-level **Mission Setup** panel for quick TLE registration.
- TLE URL lists such as `OBJECT A@https://...` and direct 3-line TLE blocks can be pasted into the app.
- `Add & Fetch` imports the pasted TLE source into the YAML-backed configuration and immediately retrieves the latest TLE.
- Satellite/ground-station target selection and display-satellite checkboxes were moved into the same setup panel.
- YAML import/export/template/GitHub/local-config controls were grouped in the setup panel to reduce button scattering.
- Added root-level `OperationalPreparationProcedures.md` for deployment/operation preparation procedures.


## v0.22.0

- Moved Mission Setup / YAML / Advanced Display Settings into a modal-style settings window.
- Main screen now prioritizes operational monitoring: Doppler output, real-time board, map/radar, pass table, and details.
- Added a prominent `Mission Setup / YAML` button in the top action area.


## v0.23.0

- KAKUSHIN専用のURL追加ボタンを削除し、一般用途向けのYAML-first UIへ整理。
- デフォルト構成はISSのみを対象に維持。
- 追尾衛星・地上局・表示衛星の切替を運用画面の `Tracking / Display` に移動。
- YAML一括設定と必要時のTLE追加は `YAML Setup / Add Satellite` モーダルに集約。
- ルートの `OperationalPreparationProcedures.md` に、一般手順とKAKUSHIN RISING URLセットアップ例を追記。


## Change Log

### v0.24.0

- OperationalPreparationProcedures.md を、TLE本文を含む最小YAML構成を前提に修正。
- `YamlSpecification.md` / `docs/YAML_SPEC.md` を追加。
- `config/minimal_iss_operation.yaml` と `config/kakushin_rising_url_operation.yaml` を追加。
- UI上のTLE追加欄を `Quick Satellite Add` として説明し、YAML一括設定が主導線であることを明確化。

## v0.25.0 UI update

- `YAML Setup` modal was reorganized into a VSCode-like setup workbench.
- Top: quick satellite add area for `name@URL` lists or 3-line TLE blocks.
- Middle: YAML editor with `Import YAML`, `Apply YAML`, `Fetch YAML URLs`, and `Sync Current` controls.
- Bottom: advanced display settings and other tools.
- The intended operation remains YAML-first: load one mission YAML, fetch URL-based TLEs when needed, then use the operation screen for tracking/display switching.
