# ARCHITECTURE

## 方針

SatPass Ops Console は、ブラウザ上で完結する静的Webアプリです。バックエンドを持たず、TLE伝搬、地上局可視判定、Doppler CSV ZIP 生成をクライアント側で実行します。

## 主要モジュール

```text
src/App.jsx
├─ YAML parse / normalize
├─ SGP4 propagation
├─ look angle calculation
├─ pass prediction
├─ Doppler CSV ZIP export
├─ SVG world map
├─ SVG radar chart
└─ React UI
```

現時点ではMVPとして単一ファイル寄りにしています。今後の拡張では、以下のように分割するのが妥当です。

```text
src/
├─ app/
│  └─ App.jsx
├─ config/
│  ├─ schema.js
│  └─ yaml.js
├─ orbit/
│  ├─ sgp4.js
│  ├─ lookAngles.js
│  ├─ passes.js
│  └─ doppler.js
├─ export/
│  └─ dopplerZip.js
├─ components/
│  ├─ WorldMap.jsx
│  ├─ RadarChart.jsx
│  ├─ SevenSegment.jsx
│  └─ PassTable.jsx
└─ styles.css
```

## データフロー

```text
YAML Import / Editor
        ↓
normalizeConfig()
        ↓
React state
        ↓
SGP4 propagation + look angle calculation
        ↓
Map / Seven-segment / Radar / Pass table
        ↓
Doppler CSV ZIP Export
```

## ドップラー計算

Range rate はレンジ時系列の中心差分で近似します。

```text
v_r ≈ (range(t+dt) - range(t-dt)) / (2dt)
```

符号規約:

```text
v_r > 0 : 衛星が地上局から遠ざかる
```

補正式:

```text
f_down = f0 * (1 - v_r / c)
f_up   = f0 / (1 - v_r / c)
```

## 地図

MVPではSVGベースの簡易地図です。`map.projection` により以下を切り替えます。

- `mercator`: Web Mercator 風の緯度変換
- `equirectangular`: 正距円筒図法

`map.background_image_url` に画像URLを指定すると背景として差し込めます。画像の投影法と `map.projection` は一致させる必要があります。

## 既知の限界

- 地図タイルではなく単一SVG背景
- Range rate は簡易中心差分
- AOS/LOS 探索は高精度な二分探索ではない
- Web Worker 化していないため、多数衛星ではUIが重くなる可能性あり
- 実運用向けの時系/IERS/EOP/局制約/機器制約は未導入

## v5 notes

- 設定は単一YAMLと分割YAMLの両方を許容する。
- `Import YAML(s)/JSON` は複数ファイル選択に対応し、`settings` / `ground_stations` / `satellites` / `doppler` / `map` をマージする。
- 衛星蝕判定は円筒影ではなく、衛星視点での地球円盤・太陽円盤の角半径と離角から `SUNLIT` / `PENUMBRA` / `UMBRA` を分類する。
- 地上局の日照判定は、太陽直下点に基づく太陽高度から `DAY` / `TWILIGHT` / `NIGHT` を分類する。

## v6 notes

- デフォルト地図を Wikimedia satellite equirectangular 背景に変更した。
- 上部7セグ表示は地図SVGの上ではなく、地図パネル内の独立領域として配置し、地図との重なりを避ける。
- `radar.background_image_url` により、レーダーチャートへスカイライン画像を重ねられる。
- `orbit_track.color_mode: sunlight` により、軌道線を `SUNLIT` / `PENUMBRA` / `UMBRA` で色分けする。
- `map` / `radar` / `orbit_track` はそれぞれ独立した分割YAMLとして読み込める。

## v7 TLE URL update flow

1. YAML/JSON/プレーンテキストから `tle_sources` を読み込む。
2. `http://www.celestrak.org` は `https://celestrak.org` に補正する。
3. CelesTrak `gp.php` URLで `FORMAT=TLE` がなければ自動付与する。
4. `Fetch TLE URLs` 実行時に各URLを `fetch()` し、3行TLEまたは2行TLEとして解析する。
5. 同じ `id` / `name` / `sourceUrl` が既存衛星にあれば更新し、なければ追加する。

## v8 UI flow

- `satellites` は登録済み衛星の正本です。
- `visibleSatIds` は地図上に描画する衛星IDの集合です。
- `selectedSatId` はレーダーチャート、Pass table、Doppler CSV ZIP の対象です。
- Pass timer は `predictPasses()` の結果から、現在パス中なら LOS まで、非パス中なら次回 AOS までを表示します。
