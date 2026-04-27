# SatPass Ops Console YAML Specification

この文書は、SatPass Ops Console で読み込めるYAML設定の主要仕様をまとめたものです。

基本方針は、**運用時に必要な情報をYAMLに集約する**ことです。特に、追尾衛星が決まっている運用では `satellites[].tle` にTLE本文を直接入れておく構成を推奨します。

---

## 1. 推奨最小構成

```yaml
settings:
  timezone: Asia/Tokyo
  min_elevation_deg: 0.0

doppler:
  uplink_base_frequency_hz: 145000000
  downlink_base_frequency_hz: 430000000

ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.604900972404
    longitude_deg: 139.88146470024
    altitude_m: 172.0032
    min_elevation_deg: 0.0

satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000
```

この構成では、YAML読み込み後すぐに衛星が登録されます。TLE取得ボタンは不要です。

---

## 2. トップレベルキー一覧

| キー | 種別 | 役割 | 必須 |
|---|---:|---|---:|
| `settings` | object | タイムゾーン、最低仰角、観測日など | 推奨 |
| `doppler` | object | uplink/downlink 周波数 | 推奨 |
| `ground_stations` | array | 地上局リスト | 推奨 |
| `satellites` | array | 衛星リスト。TLE本文またはTLE URLを持てる | 推奨 |
| `tle_sources` | string/array/object | TLE URLリスト | 任意 |
| `map` | object | 地図背景、投影法、グリッド等 | 任意 |
| `radar` | object | レーダーチャート背景画像等 | 任意 |
| `orbit_track` | object | 軌道線の日照色分け等 | 任意 |
| `app` | object | 更新周期、予測範囲など | 任意 |

---

## 3. `settings`

```yaml
settings:
  timezone: Asia/Tokyo
  min_elevation_deg: 0.0
  observation_date: 2026-04-25
  input_root: ./
  output_root: ../output
  folder_name: test_ops
```

| キー | 単位 | 説明 |
|---|---:|---|
| `timezone` | - | 表示・日付計算に使うタイムゾーン |
| `min_elevation_deg` | deg | AOS/LOS判定に使う最低仰角 |
| `observation_date` | YYYY-MM-DD | 互換用。画面上ではカレンダー選択が優先 |
| `input_root` | path | 互換用 |
| `output_root` | path | 互換用 |
| `folder_name` | string | 互換用 |

---

## 4. `doppler`

```yaml
doppler:
  uplink_base_frequency_hz: 145000000
  downlink_base_frequency_hz: 430000000
```

| キー | 単位 | 説明 |
|---|---:|---|
| `uplink_base_frequency_hz` | Hz | アップリンク基準周波数 |
| `downlink_base_frequency_hz` | Hz | ダウンリンク基準周波数 |

注意：`145.000` は145 MHzではなく145 Hzです。145 MHzなら `145000000` と書きます。

---

## 5. `ground_stations`

```yaml
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.604900972404
    longitude_deg: 139.88146470024
    altitude_m: 172.0032
    min_elevation_deg: 0.0
```

| キー | 単位 | 説明 |
|---|---:|---|
| `id` | - | アプリ内部識別子。英数字・ハイフン・アンダースコア推奨 |
| `name` | - | 画面表示名 |
| `latitude_deg` | deg | 測地緯度 |
| `longitude_deg` | deg | 測地経度 |
| `altitude_m` | m | 楕円体高または運用上の地上局高度 |
| `min_elevation_deg` | deg | この地上局の最低仰角 |

---

## 6. `satellites`

### 6.1 TLE本文を直接書く方式

```yaml
satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000
```

この方式では、YAML読み込み後すぐに衛星が登録されます。

### 6.2 `line1` / `line2` に分ける方式

```yaml
satellites:
  - id: iss
    name: ISS (ZARYA)
    line1: "1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990"
    line2: "2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000"
```

### 6.3 URLから取得する方式

```yaml
satellites:
  - id: iss
    name: ISS (ZARYA)
    tle_url: "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE"
```

この方式では、YAML読み込み後に `Fetch YAML URLs` を押す必要があります。

---

## 7. `tle_sources`

複数衛星をURLからまとめて取得したい場合に使います。

```yaml
tle_sources: |
  ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
  NOAA 19@https://celestrak.org/NORAD/elements/gp.php?CATNR=33591&FORMAT=TLE
```

1行あたり1衛星です。

```text
表示名@TLE取得URL
```

CelesTrak `gp.php` を使う場合は、`FORMAT=TLE` を付けることを推奨します。

---

## 8. `map`

```yaml
map:
  projection: equirectangular
  background_image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Equirectangular-projection.jpg?width=2048"
  background_opacity: 0.78
  attribution: Wikimedia Commons Equirectangular projection / NASA imagery derivative
  show_synthetic_land: false
  show_grid: true
```

| キー | 説明 |
|---|---|
| `projection` | `equirectangular` または `mercator` |
| `background_image_url` | 地図背景画像URL |
| `background_opacity` | 背景画像の不透明度 |
| `attribution` | 地図クレジット |
| `show_synthetic_land` | 簡易陸地を重ねるか |
| `show_grid` | 緯度経度グリッドを表示するか |

---

## 9. `radar`

```yaml
radar:
  background_image_url: ""
  background_opacity: 0.45
  attribution: ""
```

地上局から見たスカイライン画像をレーダーチャートの背景に使う場合に設定します。正方形画像を推奨します。

---

## 10. `orbit_track`

```yaml
orbit_track:
  color_mode: sunlight
  sunlit_color: "#22c55e"
  penumbra_color: "#f59e0b"
  umbra_color: "#7c3aed"
  default_color: satellite
  show_eclipse_label: true
```

| キー | 説明 |
|---|---|
| `color_mode` | `sunlight` なら日照状態、`satellite` なら衛星色で軌道線を描画 |
| `sunlit_color` | 日照区間の色 |
| `penumbra_color` | 半影区間の色 |
| `umbra_color` | 本影区間の色 |
| `default_color` | デフォルト色 |
| `show_eclipse_label` | 日照/蝕ラベルを表示するか |

---

## 11. KAKUSHIN RISING URL設定例

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

この方式では、YAML読み込み後に `Fetch YAML URLs` が必要です。
