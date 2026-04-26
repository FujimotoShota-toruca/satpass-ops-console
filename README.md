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

100%表示でも運用上の主要情報が先に見えるように、上段を「衛星名 / 地上局時刻+UTC / Azimuth / Elevation / Range / Pass Timer」に分離しています。中段は左にレーダーチャート、右に地図を配置し、`Split` / `Radar focus` / `Map focus` でどちらかを上部領域いっぱいに拡大できます。下段は従来通り、Next Visible Passes、Detailed Information、対象選択、YAML 設定エディタです。表示衛星のチェックボックスは地図上に重ねず、対象選択パネル側に移動しています。

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

`config/config_example.yaml` を参照してください。アプリ上部の `Template YAML` からも同じ形式のテンプレートをダウンロードできます。

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

`tle_sources` に `name@url` 形式でTLE取得元を列挙すると、画面上部または `Tracking Target` パネルの `Fetch TLE URLs` から一括取得できます。CelesTrak の `gp.php` URLでは、ブラウザで扱いやすいように `http://www.celestrak.org` を `https://celestrak.org` に補正し、`FORMAT=TLE` がない場合は自動付与します。

```yaml
tle_sources: |
  OBJECT A@https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
  OBJECT B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68793&FORMAT=TLE
  OBJECT C@https://celestrak.org/NORAD/elements/gp.php?CATNR=68794&FORMAT=TLE
  OBJECT D@https://celestrak.org/NORAD/elements/gp.php?CATNR=68795&FORMAT=TLE
  OBJECT E@https://celestrak.org/NORAD/elements/gp.php?CATNR=68796&FORMAT=TLE
  OBJECT F@https://celestrak.org/NORAD/elements/gp.php?CATNR=68797&FORMAT=TLE
  OBJECT G@https://celestrak.org/NORAD/elements/gp.php?CATNR=68798&FORMAT=TLE
  OBJECT H@https://celestrak.org/NORAD/elements/gp.php?CATNR=68799&FORMAT=TLE
  ELECTRON R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68800&FORMAT=TLE
  ELECTRON KICK STAGE R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68801&FORMAT=TLE
  RAISE-4@https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE
```

`TLE URL YAML` ボタンから、この一覧だけを含むテンプレートをダウンロードできます。`Load KAKUSHIN URLs` ボタンを押すと、同じURL群を現在の画面設定へ直接読み込みます。`OBJECT A@http://...` のようなプレーンテキストを `Import YAML(s)/JSON` に読み込ませることもできます。

配列形式も使えます。

```yaml
tle_sources:
  - name: OBJECT A
    url: https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
  - name: RAISE-4
    catnr: 67073
```

`CATNR`が分かっている場合は、`satellites` 側へ `catnr` または `tle_url` を置く運用も可能です。

```yaml
satellites:
  - id: object-a
    name: OBJECT A
    catnr: 68792
  - id: raise-4
    name: RAISE-4
    tle_url: https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE
```

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

現時点の range rate は、レンジの中心差分から求める簡易計算です。高精度運用に使う場合は、局座標の速度、時系、地球回転、IERS/EOP、対流圏/電離圏、実アンテナ制約などを含む検証が必要です。

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
