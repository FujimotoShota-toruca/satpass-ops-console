# Global / Local YAML Setup

SatPass Ops Console の設定は、汎用設定とローカル運用設定に分けて管理できます。

## 1. 設計方針

```text
global_setup : Git管理する汎用設定
local_setup  : 地上局・PC・受信機・運用系ソフト固有の設定
```

公開リポジトリに置くYAMLは、できるだけ `global_setup` 中心にします。`.def` のような地上局固有の派生出力は `local_setup` に置き、公開デフォルトでは無効にします。

## 2. 推奨ファイル構成

```text
config/
├─ config_example.yaml       # Git管理する統合設定例
├─ local.example.yaml        # Git管理するローカル設定テンプレート
└─ local.yaml                # Git管理しない実運用ローカル設定
```

分割YAML運用では次のようにします。

```text
config/split/
├─ settings.yaml
├─ ground_stations.yaml
├─ satellites.yaml
├─ doppler.yaml
├─ map.yaml
├─ radar.yaml
├─ orbit_track.yaml
├─ tle_sources.yaml
└─ local.example.yaml
```

実運用時は `local.example.yaml` を `local.yaml` にコピーして使います。

```powershell
Copy-Item config/local.example.yaml config/local.yaml
```

`.gitignore` には以下を入れています。

```text
config/local.yaml
config/split/local.yaml
```

## 3. 読み込み時の優先順位

アプリ内部では、概念的に次の順序で上書きされます。

```text
内部デフォルト
  < global_setup
  < local_setup
  < 画面上の一時操作
```

複数YAMLを読み込む場合は、`global_setup` 系のファイルを先に、`local_setup` 系のファイルを後に選ぶ運用を推奨します。

## 4. local_setup の代表例

`.def` を出力する地上局PCだけ、次のように明示します。

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

`.def` を出力しないPCでは、`doppler_def.enabled: false` のままでよいです。

## 5. global_setup に置くべきもの

次の設定は、プロジェクト・ミッション単位で共有されるため `global_setup` に置くのが自然です。

```yaml
global_setup:
  settings:
    timezone: Asia/Tokyo
    min_elevation_deg: 0.0
    command_elevation_deg: 5.0

  doppler:
    uplink_base_frequency_hz: 2036250000
    downlink_base_frequency_hz: 2228000000

  ground_stations:
    - id: utsunomiya
      name: Utsunomiya GS
      latitude_deg: 36.5551
      longitude_deg: 139.8828
      altitude_m: 120.0

  satellites:
    - id: target_sat
      name: TARGET-SAT
      tle: |
        TARGET-SAT
        1 ....
        2 ....
```

## 6. local_setup に置くべきもの

次の設定は、地上局・受信機・PC環境依存になりやすいため `local_setup` に置きます。

```yaml
local_setup:
  exports:
    doppler_def:
      enabled: true
      if_frequency_hz: 70000000
      rounding: round
```

この分離により、公開リポジトリは汎用アプリとして保ちつつ、実運用PCでは必要な派生出力だけを有効化できます。
