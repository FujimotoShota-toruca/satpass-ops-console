# Doppler CSV / DEF Export Specification

この文書は、SatPass Ops Console の Doppler 出力仕様をまとめたものです。

## 1. 出力の基本方針

SatPass Ops Console の標準出力は Doppler CSV です。`.def` は地上局・受信機・運用系ソフトに依存する派生形式として扱い、公開デフォルトでは出力しません。

`.def` を使う運用PCでは、Git管理しない `config/local.yaml` で明示的に有効化します。

```yaml
local_setup:
  exports:
    doppler_csv:
      enabled: true
    doppler_def:
      enabled: true
      source: downlink
      transform: downlink_minus_base_plus_if
      if_frequency_hz: 70000000
      rounding: round
```

`rounding` は以下を指定できます。

| 値 | 意味 |
|---|---|
| `round` | 四捨五入 |
| `floor` | 切り捨て |

未指定時は `round` です。

## 2. Doppler CSV

AOS から LOS までの区間について、1秒ごとに周波数・方位角・仰角を出力します。CSVはヘッダなしです。

```text
[時刻],[ドップラー補正後周波数Hz],[AZ deg],[EL deg]
```

例:

```text
02:24:28,2228050636.682,123.456789,12.345678
```

ドップラー計算の符号規約は次のとおりです。

```text
range_rate > 0 : 衛星が地上局から遠ざかる
Downlink       : f_down = f0 * (1 - v_r / c)
Uplink         : f_up   = f0 / (1 - v_r / c)
```

## 3. DEF出力を有効化した場合

`.def` は `doppler_def.enabled: true` の場合だけ生成されます。通常は downlink CSV相当の周波数列を入力として使います。

### 3.1 標準変換式

`transform: downlink_minus_base_plus_if` の場合、`.def` 第2列は以下です。

```text
DEF周波数 = integerize(ドップラー補正後downlink周波数) - downlink基準周波数 + IF周波数
```

ここで `integerize()` は `rounding` の指定に従います。

```text
rounding: round -> 四捨五入
rounding: floor -> 切り捨て
```

### 3.2 地上局ローカル仕様との対応

地上局ローカル仕様が次の場合、現在の設定と整合します。

```text
1. CSV内のドップラー補正後downlink周波数を整数化する
2. downlink基準周波数を引く
3. IF 70 MHzを足す
4. 時刻, IF周波数, AZ, EL の4列を .def として保存する
```

例として、downlink基準周波数が `2228 MHz`、IFが `70 MHz`、AOS時のdownlink補正周波数が `2228050636.682 Hz` の場合:

```text
四捨五入: 2228050637 Hz
基準周波数を引く: 2228050637 - 2228000000 = 50637 Hz
IFを足す: 50637 + 70000000 = 70050637 Hz
```

`.def` 第2列は `70050637` です。

この運用に対応する設定例は以下です。

```yaml
global_setup:
  doppler:
    downlink_base_frequency_hz: 2228000000

local_setup:
  exports:
    doppler_def:
      enabled: true
      source: downlink
      transform: downlink_minus_base_plus_if
      if_frequency_hz: 70000000
      rounding: round
```

切り捨てを使う場合は以下だけ変更します。

```yaml
rounding: floor
```

## 4. DEFファイルの行形式

`.def` はヘッダなしです。

```text
[H:MM:SS],[IF周波数Hz],[AZ deg],[EL deg]
```

CSVとの主な差分は以下です。

| 項目 | CSV | DEF |
|---|---|---|
| 時刻 | `HH:MM:SS` | `H:MM:SS`。時だけゼロ埋めなし |
| 周波数 | Doppler補正後のRF周波数 | RF基準差分 + IF |
| AZ/EL | deg | deg |

例:

```text
2:24:28,70050637,123.456789,12.345678
```

## 5. ファイル名とZIP構成

Doppler ZIP内のルートフォルダ名は、TLE 2行目の revolution number at epoch を付与します。チェックサム混入を避けるため、TLE固定桁の周回数部分だけを読んでいます。

```text
YYYYMMDD_folderName_revNNNNN/
```

`.def` が無効な場合:

```text
YYYYMMDD_folderName_revNNNNN_doppler_csv.zip
└─ YYYYMMDD_folderName_revNNNNN/
   ├─ Satellite_YYYYMMDD_AOSHHMMSS_uplink.csv
   ├─ Satellite_YYYYMMDD_AOSHHMMSS_downlink.csv
   ├─ config_used.yaml
   └─ manifest.txt
```

`.def` が有効な場合:

```text
YYYYMMDD_folderName_revNNNNN_doppler_csv_def.zip
└─ YYYYMMDD_folderName_revNNNNN/
   ├─ Satellite_YYYYMMDD_AOSHHMMSS_uplink.csv
   ├─ Satellite_YYYYMMDD_AOSHHMMSS_downlink.csv
   ├─ dop_YYYYMMDD_AOSHHMMSS-LOSHHMMSS.def
   ├─ config_used.yaml
   └─ manifest.txt
```

## 6. 互換用の旧式変換

古い設定との互換のため、`transform: legacy_offset` も残しています。ただし新規運用では推奨しません。

```yaml
local_setup:
  exports:
    doppler_def:
      enabled: true
      transform: legacy_offset
      frequency_offset_hz: 2158000000
      rounding: round
```

この場合の式は以下です。

```text
DEF周波数 = integerize(source_doppler_frequency_hz - frequency_offset_hz)
```

新規には `downlink_minus_base_plus_if` を使ってください。
