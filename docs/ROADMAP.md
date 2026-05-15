# ROADMAP

## v0.6 現状

- YAML中心の設定管理
- 単一YAML / 分割YAMLの両対応
- 複数衛星・複数地上局の登録
- Wikimedia衛星地図をデフォルト背景にした equirectangular 表示
- Mercator / equirectangular 切替
- 地図画像URLの背景差し込み、ローカル画像アップロード
- 地上局レーダーチャート
- レーダーチャートへのスカイライン背景画像差し込み
- 7セグ風テレメトリ表示
- 衛星軌道上の `SUNLIT` / `PENUMBRA` / `UMBRA` 判定
- 軌道線の日照状態別色分け
- 地上局の `DAY` / `TWILIGHT` / `NIGHT` 判定
- 指定日パス別 Doppler CSV ZIP 出力

## 次に入れるとよいもの

1. 複数衛星 × 複数地上局の可視マトリクス表示
2. 全衛星×全地上局の Doppler CSV 一括出力
3. AOS/LOS 境界の二分探索精密化
4. Skyfield版との比較検証用 debug CSV 出力
5. 衛星別 uplink/downlink 周波数設定
6. CSV出力の列カスタマイズ
7. 地上局アンテナ制約、方位角禁止域、最大追尾角速度の導入
8. TLE自動取得と履歴管理
9. Web Worker 化によるSGP4計算のUIスレッド分離
10. Python版 `tle_pass_csv_exporter` / Orekit とのクロスバリデーション
11. CesiumJS/CZMLによる3D表示

## 実運用寄りにする場合の注意

現在の実装はTLE/SGP4ベースの計画値生成です。実運用の最終値にする場合は、TLE更新タイミング、時刻同期、周波数設定丸め、無線機の制御仕様、地上局アンテナの追尾能力、衛星側トランスポンダ仕様を別途確認してください。

衛星蝕判定は旧来の円筒影近似よりは改善していますが、太陽位置・時系・EOP・地球姿勢・高精度暦は簡略化しています。運用最終判定には Orekit 等との比較検証を推奨します。

## v7 追加済み

- `tle_sources` によるTLE URL一括取得。
- `name@url` 形式、配列形式、`satellites[].tle_url`、`satellites[].catnr` に対応。
- CelesTrak `gp.php` URLの `https` 補正と `FORMAT=TLE` 自動付与。

## 次の候補

- TLE取得結果のキャッシュ有効期限表示。
- CelesTrak GROUP / INTDES / NAME 検索への対応。
- 複数衛星×複数地上局の可視マトリクスと全組み合わせCSV一括出力。

## v8 追加済み

- 表示衛星のチェックボックス選択。
- 選択中衛星名の上部表示。
- LOCAL TIME のタイムゾーン/UTC併記。
- AOS/LOS カウントダウン表示。
- レーダーチャートへの次回可視パス軌跡表示と現在位置マーカー。
- Next Visible Passes の MaxEL 時刻・MaxEL 時レンジ表示。

## v0.9.0 layout update

- 上部ダッシュボードを地図から分離し、衛星名・地上局時刻/UTC・方位角・仰角・レンジ・パスタイマーを独立表示。
- 中段を「左: レーダーチャート / 右: 地図」に再配置。
- `Split` / `Radar focus` / `Map focus` による上部表示領域の切替を追加。
- 表示衛星チェックボックスを地図オーバーレイから対象選択パネルへ移動。
- レーダーチャート内の文字情報を削減し、次回パス概要をチャート下に分離。


## v0.10.0 追加済み

- マップ左・レーダーチャート右の運用画面レイアウト。
- Next Visible Passes 行クリックによるレーダーパス固定表示。
- レーダーチャート上のパス軌跡を日照=実線、蝕=破線で表示。
- 地図表示中の衛星をレーダーチャートにもマーカー表示。
- 地図の夜側を濃くし、日照/夜側境界に一点鎖線を追加。

## v0.11.0 追加済み

- Doppler CSV ZIP の任意日付出力。
- Next Visible Passes の予測範囲を Today / 12h / 24h / 48h / 72h で切替。
- 複数パスのレーダーチャート同時表示。
- レーダーチャート下の詳細カードを削除し、チャートと凡例を拡大。
- 現在時刻に正負の分オフセットを掛ける表示・伝搬時刻オフセット機能。

## v0.13.1 追加済み

- パス予測テキストコピー処理の改行文字列が原因で発生していた build error を修正。

## v0.13.0 追加済み

- Next Visible Passes と Doppler CSV 出力のUI分離。
- 上部の狭い Doppler CSV Output パネルへの CSV date / Export 集約。
- ヘッダーのボタン密度を下げ、設定系ボタンを下段へ移動。
- パス表はレーダープロット選択と予測範囲切替に専念。


## v0.13.2 build fix

- Pin `satellite.js` to `5.0.0` to avoid the newer WASM/pthreads build path being pulled into Vite production builds.
- Pin Vite/React/js-yaml/jszip versions instead of using `latest`, so GitHub Pages/Netlify builds are reproducible.
- If an older `package-lock.json` exists, delete `node_modules` and `package-lock.json`, then run `npm install` again.

## v0.14.0

- Added in-app GitHub repository link.
- Added `Clear Local Config` to remove saved localStorage configuration.
- Added privacy/data-flow documentation for YAML import, local images, TLE URL fetches, external background images, and generated CSV ZIP files.


## v0.15.0

- Doppler算出を速度ベクトルベース化しました。
- 既存の `tle_pass_csv_exporter.py` と同じく、topocentric position / velocity のLOS方向射影で range rate を算出します。
- 次の検証課題は、Skyfield版とブラウザ版で `range_rate_mps` / `az_deg` / `el_deg` / `range_km` を同時出力して差分評価することです。


## v0.16.0

- Added one-day pass-date mode and independent operation-pass selection for PASS TIMER.
- Moved the map orbit legend outside of the map drawing area.


## v0.17.0 UI update

- Doppler CSV Output を全幅の操作ストリップとして再配置しました。
- 衛星名・地上局名・日付選択・ZIP出力ボタンが100%表示時にも潰れにくいよう、チップ表示と折り返しレイアウトに変更しました。

## v0.18.0

- Ops pass reservation toggle in Visible Passes.
- Stable pass-key based PASS TIMER target selection.
- Radar chart rendering separated into SUNLIT / ECLIPSE / NON-VISIBLE segments.

## v0.19.0

- Multiple operation-pass reservations are supported from the `Ops` column.
- `PASS TIMER` follows the reserved operation schedule and targets the next reserved pass whose LOS has not passed.
- `Text Copy` now includes `[運用]` / `[非運用]` labels for each pass.
- Radar non-visible path segments are forced to thin dashed rendering.


## v0.20.0

- URL取得型YAMLを読み込んだ直後に衛星表示が空になる問題を回避しました。
- TLE URLのみの設定では、Fetch / Update TLE 実行前にデフォルトTLEを暫定表示します。
- 設定適用メッセージに、TLE URL取得が必要な場合の案内を追加しました。

## v0.21.0

- Reworked the UI around a YAML-centered Mission Setup panel.
- Added quick TLE paste workflow: URL list / 3-line TLE -> YAML -> optional fetch.
- Moved target selection and YAML tool buttons into a single, more discoverable area.
- Added `OperationalPreparationProcedures.md` to the project root.


## v0.22.0

- 設定系UIをモーダルウィンドウに集約。
- 運用画面からTLE追加/YAML編集/表示設定を分離し、常時表示領域を削減。
- 今後の候補: 設定モーダル内のタブ化（TLE / Target / YAML / Display / Privacy）。


## v0.23.0

- KAKUSHIN専用のURL追加ボタンを削除し、一般用途向けのYAML-first UIへ整理。
- デフォルト構成はISSのみを対象に維持。
- 追尾衛星・地上局・表示衛星の切替を運用画面の `Tracking / Display` に移動。
- YAML一括設定と必要時のTLE追加は `YAML Setup / Add Satellite` モーダルに集約。
- ルートの `OperationalPreparationProcedures.md` に、一般手順とKAKUSHIN RISING URLセットアップ例を追記。


## v0.24.0

- OperationalPreparationProcedures.md を、TLE本文を含む最小YAML構成前提に修正。
- `YamlSpecification.md` / `docs/YAML_SPEC.md` を追加。
- `config/minimal_iss_operation.yaml` と `config/kakushin_rising_url_operation.yaml` を追加。
- Quick Satellite Addの位置づけを、YAML一括設定を補完する衛星追加補助機能として明確化。

## v0.25.0

- Reworked the setup modal into a VSCode-like three-zone layout: Quick TLE Add, YAML Editor, and Advanced/Tools.
- Moved URL TLE fetching next to the YAML editor to make the `tle_sources` workflow more explicit.
- Preserved operation-screen controls for tracking satellite, ground station, and visible satellite selection.

## v0.26.0 update

- Added setup status indicators for YAML, TLE URL fetch state, satellite count, ground-station count, tracking satellite, and ground station.
- Clarified button labels: `Fetch Now & Add`, `Insert into YAML only`, `Fetch URL TLEs`, and `Sync from Current State`.
- Added stronger Fetch guidance when `tle_sources` are present in YAML.
- Reworked the operation layout to: realtime dashboard, map/radar, Tracking / Display, Visible Passes + Doppler CSV Output, and Detailed Information.



## v0.26.1 UI Refinement

- Operational screen order is now: real-time dashboard, map/radar, Tracking / Display, Visible Passes + Doppler CSV Output, Detailed Information.
- Mission state display is shown inside the YAML setup dialog so the operation screen stays focused.
- Button labels were clarified: `Fetch URL TLEs`, `Fetch Now & Add`, `Insert into YAML Only`, and `Sync from Current State`.
- When `tle_sources` are present, the setup dialog shows an explicit fetch callout.


## v0.26.2

- Fixed blank screen caused by missing mission status component/state wiring in v0.26.1.

## v0.27.0

- Ops pass reservation now uses pass snapshots, so operation reservations do not disappear merely because a pass leaves the current visible table window.
- Added skyline CSV overlay support for the radar chart. Accepted formats include `azimuth_deg,elevation_deg`, `az_deg,el_deg`, Japanese-like headers such as `方位角,仰角`, or simple two-column numeric CSV.


## v0.28.0

- Visible Passes の Ops 予約を 1Day 以外の予測範囲でも保持しやすい安定キー/スナップショット照合に変更。
- AOS/LOS と MaxEL 時刻を 30秒グリッド依存ではなく、仰角しきい値の交差時刻を二分探索で求める方式に変更。
- `command_elevation_deg` を追加し、従来AOS/LOSとは別に Command AOS/LOS のカウントダウンを PASS TIMER 内に表示。


### v0.29.0

- 通常AOS/LOSタイマーとCommand AOS/LOSタイマーを別カード表示に変更。
- `Visible Passes` のデフォルト予測範囲を `1Day` に変更。
- 最小YAML構成に `command_elevation_deg` を含める方針を明記。
- 地上局緯度・経度で10進数degに加え、度/分/秒（DMS）形式に対応。
