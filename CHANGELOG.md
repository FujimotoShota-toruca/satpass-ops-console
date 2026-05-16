# Changelog

## v0.30.0 - 2026-05-16

### Added

- `local_setup.exports.doppler_def.rounding` を追加。
  - `round`: 四捨五入。
  - `floor`: 切り捨て。
- `docs/DOPPLER_EXPORT.md` を追加し、Doppler CSV / DEF 出力仕様を分離。
- `docs/LOCAL_SETUP.md` を追加し、`global_setup` / `local_setup` の設計方針を分離。
- READMEから詳細仕様を分割し、主要ドキュメントへの導線を追加。

### Changed

- `.def` 第2列の標準変換を、地上局ローカル仕様に合わせて明文化。

```text
DEF周波数 = integerize(ドップラー補正後downlink周波数) - downlink基準周波数 + IF周波数
```

- `config/local.example.yaml` と `config/split/local.example.yaml` に `rounding: round` を追加。
- `manifest.txt` に `doppler_def_rounding` を出力。

### Notes

- 公開デフォルトでは `.def` は引き続き出力しません。
- `.def` は `local_setup.exports.doppler_def.enabled: true` の場合だけ生成します。

## v0.29.0

### Added

- `global_setup` / `local_setup` 方式を導入。
- `.def` をローカル設定で明示的に有効化する設計に変更。
- `.gitignore` に `config/local.yaml` と `config/split/local.yaml` を追加。
- Doppler ZIPルートフォルダ名に TLE revolution number at epoch を付与。

## v0.28.0

### Added

- Doppler CSVに対応する `.def` 生成機能を追加。
- 選択中衛星のTLEコピー機能を追加。
- 運用画面側にTLE取得ボタンを追加。
- Visible Passes のデフォルトを `1Day` に変更。
