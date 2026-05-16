# SatPass Ops Console Operational Preparation Procedures

本書は、SatPass Ops Console を使って、TLE設定、可視パス確認、運用パス予約、Doppler CSV出力を行うための準備手順です。

基本方針は **YAML一括設定** です。運用で追尾する衛星・地上局・周波数は最初からYAMLに入れておき、画面上の追加操作は「必要なときだけ使う補助機能」として扱います。

---

## 1. アプリを開く

GitHub Pages版を使う場合は公開URLへアクセスします。

ローカル版を使う場合は、プロジェクトルートで以下を実行します。

```powershell
npm install
npm run dev
```

公開前は、`npm run build` で `dist/` が生成できることも確認します。

```powershell
npm run build
```

---

## 2. 画面構成

通常運用時に主に触る場所は以下です。

```text
上段       : Doppler CSV Output
その下     : Tracking / Display
リアルタイム: GS TIME / AZIMUTH / ELEVATION / RANGE / PASS TIMER
中央       : Map / Radar Chart
下段       : Visible Passes
設定       : YAML Setup モーダル
```

追尾衛星・地上局・表示衛星は、運用画面の `Tracking / Display` で切り替えます。

`YAML Setup` は、YAML一括読み込み、YAML出力、必要時の衛星追加を行うための設定画面です。運用中に常時触る場所ではありません。

---

## 3. 最小YAML設定例

運用で追尾する衛星が決まっている場合は、最小構成の時点でTLE本文を入れておくのが推奨です。この場合、YAMLを読み込んだ時点で衛星が登録されるため、追加のTLE取得操作は不要です。

以下はISSを例にした最小構成です。実運用では `satellites[].tle` を対象衛星の最新TLEに差し替えてください。

```yaml
settings:
  timezone: Asia/Tokyo
  min_elevation_deg: 0.0
  # コマンドAOS/LOSに使う仰角 [deg]
  command_elevation_deg: 5.0

# Doppler設定。単位は Hz。
# 145 MHz / 430 MHz の場合は 145000000 / 430000000 と書く。
doppler:
  uplink_base_frequency_hz: 145000000
  downlink_base_frequency_hz: 430000000

# 地上局情報。複数局に対応。
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.604900972404
    longitude_deg: 139.88146470024
    altitude_m: 172.0032
    min_elevation_deg: 0.0

# 衛星情報。2行TLEまたは3行TLEをそのまま記述する。
satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000
```

注意：`uplink_base_frequency_hz` / `downlink_base_frequency_hz` は **Hz指定**です。`145.000` と書くと 145 MHz ではなく 145 Hz として扱われます。

### 地上局座標を度/分/秒で書く場合

10進数degの代わりに、度/分/秒方式も使えます。例えば以下のように書きます。

```yaml
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_dms: "36°36'17.6435\"N"
    longitude_dms: "139°52'53.273\"E"
    altitude_m: 172.0032
    min_elevation_deg: 0.0
```

オブジェクト形式でも指定できます。

```yaml
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude:
      deg: 36
      min: 36
      sec: 17.6435
      hemisphere: N
    longitude:
      deg: 139
      min: 52
      sec: 53.273
      hemisphere: E
    altitude_m: 172.0032
    min_elevation_deg: 0.0
```

南緯・西経の場合は `S` / `W` を使ってください。

---

## 4. YAML一括設定の手順

1. `YAML Setup` を押します。
2. `Import YAML` を押します。
3. 作成したYAMLを選択します。
4. 画面の `Tracking / Display` で、追尾衛星・地上局・表示衛星を確認します。
5. `Visible Passes` にパスが表示されることを確認します。

`3. 最小YAML設定例` のように `satellites[].tle` にTLE本文を直接入れている場合、`Fetch YAML URLs` は不要です。

一方で、YAMLに `tle_sources` や `satellites[].tle_url` だけを書いている場合、YAML読み込み直後にはまだTLE本文がありません。この場合は、`YAML Setup` 内の `Fetch YAML URLs` を押してTLEを取得してください。

---

## 5. 「TLE入力欄」とは何か

過去の手順では「TLE入力欄に貼り付ける」と書いていましたが、現在のUIではこの欄は **Quick Satellite Add** という補助欄です。

場所は以下です。

```text
YAML Setup を開く
  → Optional / Quick Satellite Add
    → Paste name@URL list or 3-line TLE here
```

この大きなテキストエリアが、旧手順でいう「TLE入力欄」です。

ただし、基本運用ではこの欄を使わなくて構いません。通常はYAMLに `satellites:` を書いて、`Import YAML` で一括設定します。

Quick Satellite Add は、次のような場合に使います。

```text
・YAMLを作り直さず、一時的に衛星を追加したい
・TLE URLを貼って、その場で取得したい
・3行TLEを手で貼って、現在のYAML状態へ追加したい
```

---

## 6. Quick Satellite AddでTLE URLを追加する場合

`YAML Setup` の `Optional / Quick Satellite Add` 欄に、以下のように `表示名@URL` 形式で貼り付けます。

```text
ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
```

その後、`Add & Fetch` を押します。

複数衛星を追加する場合は、1行に1衛星ずつ記述します。

```text
SAT-A@https://celestrak.org/NORAD/elements/gp.php?CATNR=XXXXX&FORMAT=TLE
SAT-B@https://celestrak.org/NORAD/elements/gp.php?CATNR=YYYYY&FORMAT=TLE
```

GitHub PagesなどHTTPS上で動かす場合、TLE URLは `http://` ではなく `https://` を推奨します。

---

## 7. Quick Satellite Addで3行TLEを直接追加する場合

TLE URLではなく、TLE本文を直接追加する場合は、Quick Satellite Add欄に以下のように貼り付けます。

```text
ISS (ZARYA)
1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000
```

その後、`Add to YAML` を押します。

`Add to YAML` は、貼り付けたTLEを現在のYAML状態へ取り込む操作です。TLE URLの取得は行いません。

---

## 8. KAKUSHIN RISING系TLE URLのセットアップ例

KAKUSHIN RISING OBJECT A-H を扱う場合は、次のように `tle_sources` をYAMLに書きます。

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

この方式では、YAML読み込み後に `Fetch YAML URLs` を押す必要があります。

KAKUSHIN用の一括設定例は、`config/kakushin_rising_url_operation.yaml` も参照してください。

---

## 9. Visible Passesの使い方

`Visible Passes` では、対象日のパス一覧を確認します。

基本運用では `1Day` を使います。日付をカレンダーで選択すると、その日の 00:00–24:00 のパスが表示されます。

`12h / 24h / 48h / 72h` は、現在時刻からの予測範囲です。

`Radar` 列をクリックすると、そのパスがレーダーチャートに表示されます。再クリックで解除されます。

`Ops` 列をクリックすると、そのパスを運用予定として予約します。複数予約できます。再クリックで解除されます。

---

## 10. PASS TIMERの見方

運用予定パスが予約されている場合、`PASS TIMER` は予約済みパスのうち、まだLOSを過ぎていない最初のパスを対象にします。

非パス時は AOS までのカウントダウン、パス中は LOS までのカウントダウンを表示します。

運用予定パスがない場合は、アプリが自動的に次の可視パスを対象にします。

---

## 11. Doppler CSV ZIPの出力

1. `Tracking / Display` で対象衛星と地上局を選びます。
2. 上段の `DOPPLER CSV OUTPUT` の `CSV date` を設定します。
3. `Export Doppler CSV ZIP` を押します。

ZIP内には、選択中の衛星・地上局について、パスごとの uplink/downlink CSV が出力されます。公開デフォルトでは `.def` は出力されません。必要な運用PCでは `config/local.yaml` などの `local_setup.exports.doppler_def.enabled` を `true` にしてください。その場合は各パスに `dop_YYYYMMDD_AOS-LOS.def` も追加されます。

`.def` の第2列は、標準では `integerize(ドップラー補正後downlink周波数) - downlink基準周波数 + IF周波数` です。`integerize()` は `local_setup.exports.doppler_def.rounding` で選び、`round` は四捨五入、`floor` は切り捨てです。詳細は `docs/DOPPLER_EXPORT.md` を参照してください。

ファイル名は概ね以下です。

```text
衛星名_日付_AOS時刻_uplink.csv
衛星名_日付_AOS時刻_downlink.csv
```

---

## 12. Slack等へのパス情報コピー

`Visible Passes` の `Text Copy` を押すと、パス一覧をテキスト形式でコピーできます。

```text
Pass[日付No] [AOS時刻]to[LOS時刻]@MEL=[MEL][deg.] [運用/非運用] の形式で書いております

4/27
Pass[01] 01:20 to 01:28 @ MEL=8.3[deg.] [非運用]
Pass[02] 02:52 to 03:04 @ MEL=66.5[deg.] [運用]
```

---

## 13. 運用前チェックリスト

```text
[ ] YAMLに対象衛星のTLE本文、またはTLE取得URLが入っている
[ ] TLE本文を直接入れる場合、TLEが最新である
[ ] TLE URL方式の場合、Fetch YAML URLs / Add & Fetch を実行した
[ ] 追尾衛星が正しい
[ ] 表示衛星が必要なものだけONになっている
[ ] 地上局座標が正しい
[ ] 周波数がHz単位で正しい
[ ] Visible Passesの日付が正しい
[ ] Ops列で運用予定パスを予約した
[ ] PASS TIMERが予約パスを対象にしている
[ ] Doppler CSV dateが正しい
[ ] uplink/downlink CSVが出力されている
```

---

## 14. YAML仕様

YAMLで使える主なキーは `YamlSpecification.md` にまとめています。最初に読むべき項目は以下です。

```text
satellites       : 追尾対象衛星。直接TLEを書く場合に使う
tle_sources      : URLからTLEを取得する場合に使う
ground_stations  : 地上局
doppler          : uplink/downlink 周波数
settings         : タイムゾーン、最低仰角など
map / radar      : 背景画像や表示設定
orbit_track      : 軌道線の日照色分け設定
```
