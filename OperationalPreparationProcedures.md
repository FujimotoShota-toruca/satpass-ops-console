# SatPass Ops Console 運用準備手順

対象：URL取得TLEを用いた可視パス確認・運用パス予約・Doppler CSV出力

---

## 0. 注意：周波数単位

`uplink_base_frequency_hz` / `downlink_base_frequency_hz` は **Hz指定**です。

たとえば、145 MHz / 430 MHz の場合は、以下のように記述します。

```yaml
doppler:
  uplink_base_frequency_hz: 145000000
  downlink_base_frequency_hz: 430000000
```

`145.000` / `430.000` と書くと、145 Hz / 430 Hz として扱われるため注意してください。

---

## 1. SatPass Ops Consoleを開く

GitHub Pages版を使う場合は、公開URLへアクセスします。

ローカル版を使う場合は、プロジェクトフォルダで以下を実行します。

```powershell
npm install
npm run dev
```

ブラウザで表示されたアプリ画面を開きます。

---

## 2. 設定YAMLを作成する

TLE URL、地上局、Doppler設定をまとめて1つのYAMLに書く場合は、以下をテンプレートとして使用します。

```yaml
# ==========================================
# SatPass Ops Console Operation Config
# ==========================================

# TLE取得URL
# 「表示名@URL」の形式で記述する
# CelesTrak gp.php を使う場合は FORMAT=TLE を付ける
tle_sources: |
  TARGET SAT@https://celestrak.org/NORAD/elements/gp.php?CATNR=XXXXX&FORMAT=TLE

# Doppler設定
# 単位は Hz
# 145 MHz / 430 MHz の場合は 145000000 / 430000000 とする
doppler:
  uplink_base_frequency_hz: 145000000
  downlink_base_frequency_hz: 430000000

# 地上局情報
# 複数局に対応
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.604900972404
    longitude_deg: 139.88146470024
    altitude_m: 172.0032
    min_elevation_deg: 0.0
```

`TARGET SAT` と `CATNR=XXXXX` は対象衛星に合わせて変更します。

URLがすでに分かっている場合は、以下のように記述します。

```yaml
tle_sources: |
  OBJECT A@https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
```

複数衛星を扱う場合は、1行に1衛星ずつ追加します。

```yaml
tle_sources: |
  OBJECT A@https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
  OBJECT B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68793&FORMAT=TLE
  OBJECT C@https://celestrak.org/NORAD/elements/gp.php?CATNR=68794&FORMAT=TLE
```

---

## 3. YAMLをアプリに読み込む

1. アプリ画面の設定エリアにある `Import YAML(s)/JSON` を押します。
2. 作成したYAMLファイルを選択します。
3. 読み込み後、以下を確認します。

```text
・対象衛星が登録されていること
・Ground Station に Utsunomiya GS が反映されていること
・Doppler設定の周波数が意図した値になっていること
```

---

## 4. TLEをURLから取得する

1. `Fetch TLE URLs` ボタンを押します。
2. 正常に取得できると、TLE URLに対応した衛星がアプリ内に登録されます。
3. 衛星選択欄で対象衛星を選択します。
4. 複数衛星がある場合は、表示衛星チェックボックスで地図上に表示する衛星を選びます。

---

## 5. 可視パスを確認する

`Visible Passes` の `Window` を `1Day` にします。

これは基本運用モードです。

日付欄で対象日を選択すると、その日の 00:00–24:00 の可視パスが一覧表示されます。

表示される主な項目は以下です。

```text
AOS          : 可視開始時刻
MaxEL Time   : 最大仰角時刻
LOS          : 可視終了時刻
MaxEL        : 最大仰角
Range@MaxEL  : 最大仰角時のレンジ
```

---

## 6. レーダーチャートにパスを表示する

1. `Visible Passes` の `Radar` 列をクリックします。
2. クリックしたパスがレーダーチャートに表示されます。
3. もう一度クリックすると表示解除されます。
4. 複数パスを同時に選択できます。

これにより、候補パスの方位・仰角プロファイルを比較できます。

---

## 7. 運用パスを予約する

1. `Visible Passes` の `Ops` 列をクリックします。
2. クリックしたパスが運用予定として予約されます。
3. もう一度クリックすると予約解除されます。
4. 複数パスを運用予定として予約できます。

予約されたパスは、`PASS TIMER AOS / LOS / DONE` の対象になります。

動作は以下の通りです。

```text
・予約パス前     : AOSまでのカウントダウン
・予約パス中     : LOSまでのカウントダウン
・予約パス終了後 : DONE表示
```

予約パスが複数ある場合は、まだLOSを過ぎていない最初の予約パスが優先されます。

予約パスがない場合は、アプリが自動的に次の可視パスを対象にします。

---

## 8. Doppler CSVを出力する

1. 上部の `DOPPLER CSV OUTPUT` 領域を確認します。
2. 対象衛星と地上局が正しいことを確認します。
3. `CSV date` を出力したい日付に設定します。
4. `Export Doppler CSV ZIP` を押します。

ZIP内には、パスごとの uplink / downlink CSV が出力されます。

ファイル名は概ね以下の形式です。

```text
衛星名_日付_AOS時刻_uplink.csv
衛星名_日付_AOS時刻_downlink.csv
```

CSVは、選択中の衛星と地上局に対して出力されます。

---

## 9. Slack等へパス予定を貼り付ける

`Visible Passes` の `Text Copy` ボタンを押します。

以下のような形式でクリップボードにコピーされます。

```text
Pass[日付No] [AOS時刻]to[LOS時刻]@MEL=[MEL][deg.] [運用/非運用] の形式で書いております

4/27
Pass[01] 01:20 to 01:28 @ MEL=8.3[deg.] [非運用]
Pass[02] 02:52 to 03:04 @ MEL=66.5[deg.] [運用]
Pass[03] 04:31 to 04:36 @ MEL=2.1[deg.] [非運用]
```

この内容をSlackやDiscordへ貼り付けます。

---

## 10. 運用前チェックリスト

運用前に最低限確認する項目は以下です。

```text
[ ] TLE取得日時が新しい
[ ] 対象衛星が正しい
[ ] 地上局座標が正しい
[ ] 周波数設定がHz単位で正しい
[ ] Visible Passesの対象日が正しい
[ ] Radar列で確認したいパスを表示した
[ ] Ops列で運用パスを予約した
[ ] PASS TIMERが予約パスを対象にしている
[ ] Doppler CSVの出力日付が正しい
[ ] uplink/downlink CSVが両方出力されている
[ ] Text Copyで共有用パス予定を作成した
```

---

## 11. 推奨ファイル名

設定ファイル名は、地上局名と対象衛星群が分かる名前にします。

例：

```text
satpass_ops_utsunomiya_target.yaml
satpass_ops_utsunomiya_kakushin.yaml
satpass_ops_utsunomiya_mono_nikko.yaml
```

---

## 12. データ取り扱い上の注意

SatPass Ops Consoleでは、YAMLファイルや画面上で入力した設定は、基本的にブラウザ内で処理されます。

ただし、以下の場合は外部通信が発生します。

```text
・TLE URLからTLEを取得するとき
・外部URLの地図画像を読み込むとき
・外部URLのレーダー背景画像を読み込むとき
```

また、アプリ設定はブラウザの localStorage に保存される場合があります。

共用PCで使用した場合は、必要に応じて `Clear Local Config` を実行してください。

---

## 13. トラブルシュート

### TLEが取得できない

確認項目：

```text
・URLが https:// になっているか
・CelesTrak gp.php の場合、FORMAT=TLE が付いているか
・ブラウザの開発者ツールでCORSエラーが出ていないか
・対象CATNRが正しいか
```

### パスが表示されない

確認項目：

```text
・対象日が正しいか
・TLE epochが古すぎないか
・地上局座標が正しいか
・min_elevation_deg が高すぎないか
・対象衛星が選択されているか
```

### Doppler CSVが想定と違う

確認項目：

```text
・周波数がHz単位で指定されているか
・CSV dateが正しいか
・対象衛星と地上局が正しいか
・TLEが既存オフラインツールと同一か
```

