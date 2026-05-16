# SatPass Ops Console

SatPass Ops Console は、TLE と地上局情報を YAML で登録し、ブラウザ上で衛星の地上軌跡、可視パス、方位角・仰角、日照/蝕、Doppler CSV を表示・出力するフロントエンド完結型の運用支援アプリです。

GitHub Pages: https://fujimotoshota-toruca.github.io/satpass-ops-console/

## 主な機能

- YAML による TLE・地上局・周波数・表示設定の一括管理
- `global_setup` / `local_setup` による汎用設定と地上局固有設定の分離
- 複数衛星・複数地上局の登録
- CelesTrak 等のURLからのTLE取得・更新
- 選択中衛星TLEのコピー
- SGP4 によるリアルタイム衛星位置表示
- 地図上での衛星直下点、地上軌跡、簡易フットプリント表示
- レーダーチャート上でのパス軌跡表示
- Visible Passes の `1Day` デフォルト表示
- 指定日1日分の Doppler CSV ZIP 出力
- ローカル設定で明示した場合のみ、地上局仕様 `.def` の追加出力
- GitHub Pages への静的デプロイ

## セットアップ

```bash
npm ci
npm run dev
```

ビルド確認:

```bash
npm run build
npm run preview
```

`npm ci` が失敗する場合だけ、依存関係を作り直してください。

```bash
npm install
```

## ドキュメント

詳細仕様は用途別に分割しています。

| 文書 | 内容 |
|---|---|
| `docs/LOCAL_SETUP.md` | `global_setup` / `local_setup` の分離方針 |
| `docs/DOPPLER_EXPORT.md` | Doppler CSV / DEF の出力仕様、周波数変換、丸め方式 |
| `YamlSpecification.md` | YAMLキー全体の仕様 |
| `OperationalPreparationProcedures.md` | 運用準備手順 |
| `docs/CONFIG_SCHEMA.md` | 設定スキーマの補足 |
| `docs/TROUBLESHOOTING.md` | トラブルシューティング |
| `CHANGELOG.md` | バージョン履歴 |

## YAML構成の基本方針

設定は次の2層に分けられます。

```text
global_setup : Git管理する汎用設定
local_setup  : 地上局・PC・受信機固有のローカル設定
```

`.def` は地上局固有の派生形式なので、公開デフォルトでは出力しません。必要な運用PCだけ `config/local.yaml` で有効化します。

```yaml
local_setup:
  exports:
    doppler_def:
      enabled: true
      source: downlink
      transform: downlink_minus_base_plus_if
      if_frequency_hz: 70000000
      rounding: round
```

`config/local.yaml` と `config/split/local.yaml` は `.gitignore` 対象です。

## Doppler CSV / DEF

標準では Doppler CSV だけを出力します。`.def` を有効化した場合、第2列は次の地上局ローカル仕様で生成します。

```text
DEF周波数 = integerize(ドップラー補正後downlink周波数) - downlink基準周波数 + IF周波数
```

`integerize()` は `local_setup.exports.doppler_def.rounding` で選択します。

```text
round : 四捨五入
floor : 切り捨て
```

例として、downlink基準周波数 `2228 MHz`、IF `70 MHz`、Doppler補正後downlink周波数 `2228050636.682 Hz`、`rounding: round` の場合:

```text
2228050636.682 -> 2228050637
2228050637 - 2228000000 + 70000000 = 70050637
```

詳細は `docs/DOPPLER_EXPORT.md` を参照してください。

## 設定例

| ファイル | 用途 |
|---|---|
| `config/config_example.yaml` | 統合設定例 |
| `config/local.example.yaml` | ローカル設定テンプレート |
| `config/minimal_iss_operation.yaml` | 最小構成例 |
| `config/kakushin_rising_url_operation.yaml` | URL取得を使う構成例 |
| `config/split/*.yaml` | 分割YAMLテンプレート |

分割YAMLは `Import YAML(s)/JSON` で複数選択できます。`local_setup` を含むローカル設定は最後に読み込む運用を推奨します。

## ビルド・デプロイ

```bash
npm ci
npm run build
```

生成された `dist/` を GitHub Pages 等に配置できます。リポジトリ付属の `.github/workflows/deploy-pages.yml` でもデプロイ可能です。
