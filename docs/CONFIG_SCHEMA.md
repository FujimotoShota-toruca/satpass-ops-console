# Config Schema

詳細なYAML仕様はルートの `YamlSpecification.md` および `docs/YAML_SPEC.md` も参照してください。

# Configuration Schema

SatPass Ops Console v8 は、従来の単一YAML形式と、分割YAML形式の両方を受け付けます。

## 推奨: 分割しやすい統合YAML

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
  def_frequency_offset_hz: 2158000000

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
  projection: mercator
  background_image_url: "./assets/world_mercator_simple.svg"
  background_opacity: 0.90
  attribution: Bundled simplified Mercator-style SVG
  show_synthetic_land: false
  show_grid: true
```

## 分割YAML

次の8ファイルへ分けられます。`Import YAML(s)/JSON` で複数選択すると、アプリ内でマージします。

```text
settings.yaml
ground_stations.yaml
satellites.yaml
doppler.yaml
map.yaml
radar.yaml
orbit_track.yaml
tle_sources.yaml
```

同梱テンプレートは `config/split/` を参照してください。

## 後方互換キー

v3/v4で使っていた以下の形式も読み込めます。

```yaml
input_root: ./
output_root: ../output
observation_date: 2026-04-25
folder_name: test_ops
timezone: Asia/Tokyo
uplink_base_frequency_hz: 2036250000
downlink_base_frequency_hz: 2201000000
min_elevation_deg: 0.0

ground_station:
  name: Utsunomiya GS
  latitude_deg: 36.5551
  longitude_deg: 139.8828
  altitude_m: 120.0

tle: |
  ISS (ZARYA)
  1 ...
  2 ...
```


## tle_sources / TLE URL update

`tle_sources` は、CelesTrak等のTLE更新URLからブラウザ上でTLEを取得するための設定です。`Fetch TLE URLs` 実行時に取得し、既存衛星と同名・同IDなら更新、未登録なら追加します。

### name@url 形式

```yaml
tle_sources: |
  ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
  RAISE-4@https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE
```

### 配列形式

```yaml
tle_sources:
  - name: ISS (ZARYA)
    url: https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
  - name: RAISE-4
    catnr: 67073
```

### satellites 側に書く形式

```yaml
satellites:
  - id: iss
    name: ISS (ZARYA)
    catnr: 25544
  - id: raise-4
    name: RAISE-4
    tle_url: https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE
```

対応キー: `tle_sources`, `tle_update_urls`, `tle_urls`, `satellites[].tle_url`, `satellites[].update_url`, `satellites[].catnr`, `satellites[].norad_cat_id`。

`http://www.celestrak.org/...` はブラウザの混在コンテンツ回避のため、内部で `https://celestrak.org/...` に補正します。CelesTrak `gp.php` では `FORMAT=TLE` がない場合に自動付与します。

## map

| key | type | description |
|---|---:|---|
| `projection` | string | `mercator` or `equirectangular` |
| `background_image_url` | string | 背景地図画像URLまたは同梱パス |
| `background_opacity` | number | 0.0〜1.0 |
| `attribution` | string | 地図画像の出典表示 |
| `show_synthetic_land` | boolean | 背景画像なし時の簡易陸地表示 |
| `show_grid` | boolean | 緯度経度グリッド表示 |

投影法と地図画像は一致させてください。不一致だと、衛星直下点や軌跡の重なりが見かけ上ずれます。

## doppler

| key | unit | description |
|---|---:|---|
| `uplink_base_frequency_hz` | Hz | アップリンク基準周波数 |
| `downlink_base_frequency_hz` | Hz | ダウンリンク基準周波数 |
| `def_frequency_offset_hz` | Hz | DEF第2列を作るときに downlink補正周波数から差し引く値 |

現状は全衛星共通です。衛星別周波数が必要な場合は、次の拡張候補です。

```yaml
satellites:
  - id: sat-a
    name: SAT-A
    doppler:
      uplink_base_frequency_hz: 2036250000
      downlink_base_frequency_hz: 2201000000
```

## eclipse / sunlight

衛星蝕判定は、衛星から見た地球視半径・太陽視半径・太陽地球中心方向離角による幾何判定です。

- `SUNLIT`: 地球円盤と太陽円盤が重ならない
- `PENUMBRA`: 部分蝕
- `UMBRA`: 本影

地上局側は太陽高度から次で分類します。

- `DAY`: 太陽高度 >= 0 deg
- `TWILIGHT`: -6 deg <= 太陽高度 < 0 deg
- `NIGHT`: 太陽高度 < -6 deg

運用最終値として使う場合は、Orekit等で時系・EOP・高精度暦を含めて検証してください。


## radar

レーダーチャート背景、主に地上局から見たスカイライン画像の設定です。

```yaml
radar:
  background_image_url: ""
  background_opacity: 0.45
  attribution: ""
```

| key | unit/type | description |
|---|---:|---|
| `background_image_url` | string | レーダーチャート背景画像URL。空文字なら通常背景。 |
| `background_opacity` | 0..1 | 背景画像の不透明度。 |
| `attribution` | string | 画像の出典メモ。 |

## orbit_track

軌道プロットの色分け設定です。

```yaml
orbit_track:
  color_mode: sunlight
  sunlit_color: "#22c55e"
  penumbra_color: "#f59e0b"
  umbra_color: "#7c3aed"
  default_color: satellite
  show_eclipse_label: true
```

| key | unit/type | description |
|---|---:|---|
| `color_mode` | `sunlight` / `satellite` | `sunlight` なら軌道上日照で色分け、`satellite` なら衛星設定の色で描画。 |
| `sunlit_color` | CSS color | `SUNLIT` 区間の軌道線色。 |
| `penumbra_color` | CSS color | `PENUMBRA` 区間の軌道線色。 |
| `umbra_color` | CSS color | `UMBRA` 区間の軌道線色。 |
| `show_eclipse_label` | boolean | 衛星直下点ラベル下に日照状態を表示するか。 |

## v8 UI state note

表示衛星チェックボックスの状態は、現在のブラウザセッション内のUI状態として扱います。YAMLの衛星登録そのものは `satellites:` / `tle_sources:` で管理し、Doppler CSV出力は選択中の衛星を対象にします。

## v0.11.0 UI runtime controls

The following controls are currently UI runtime state rather than YAML-persisted schema fields:

- `CSV date`: observation date used by Doppler CSV ZIP export.
- `Pass prediction window`: `Today`, `12h`, `24h`, `48h`, `72h`.
- `Time offset min`: signed minute offset applied to the displayed/propagated current time.
- Radar pass row selection: multiple rows can be selected/unselected from `Next Visible Passes`.


## Command AOS/LOS elevation

任意の仰角をコマンド運用開始/終了の基準として使う場合は、`command_elevation_deg` を指定します。通常の可視判定は地上局ごとの `min_elevation_deg`、コマンドタイマーは `command_elevation_deg` を使います。

```yaml
settings:
  min_elevation_deg: 0.0
  command_elevation_deg: 5.0
```
