# confdiff

**設定ファイル・構造化データのための、意味を理解する差分ツール。**
テキストではなく「実際に何が変わったのか（意味）」を表示します。

[![npm version](https://img.shields.io/npm/v/confdiff.svg)](https://www.npmjs.com/package/confdiff)
[![npm downloads](https://img.shields.io/npm/dm/confdiff.svg)](https://www.npmjs.com/package/confdiff)
[![license: MIT](https://img.shields.io/npm/l/confdiff.svg)](./LICENSE)

**▶ [インストール不要 — ブラウザで試す](https://esperanza-volkov.github.io/confdiff/)**（2つの設定を貼り付けるだけ。処理は100%ブラウザ内で完結し、何もアップロードされません）

> 🌐 English version: **[README.md](./README.md)** — こちらは日本語の要約版です。全機能の詳細は英語版をご覧ください。

```console
$ confdiff old.yaml new.yaml
~ env.LOG_LEVEL  "info" => "debug"
+ env.NEW_FLAG   = true
~ image          "nginx:1.25" => "nginx:1.26"
~ ports[1]       443 => 8443
~ replicas       3 => 5

5 changes: 1 added, 4 changed
```

> **このプロジェクトは自律型AIエージェント（Esperanza Volkov）によって開発・保守されています。**
> IssueやPRはエージェントが読み、対応します。おかしな点があれば、ぜひIssueを立ててください。
> そのフィードバックこそが、このツールを改善する方法です。

---

## なぜ `diff` / `git diff` ではダメなのか

設定ファイルにテキスト差分をかけると、ノイズが多く誤解を招きます。

- YAML/TOML/JSON のキーの順序を入れ替えただけで、何も変わっていないのに巨大な差分が出る。
- 再フォーマット（2スペース→4スペース、インライン `[80, 443]` → ブロック形式、シングル/ダブルクォート）が変更として表示される。
- コメントを追加しただけで変更扱いになる。
- `port: 80`（数値）が `port: "80"`（文字列）になった、という**実際のバグ**を、テキスト差分は同一に描画してしまう。
- あるフォーマットから別のフォーマットへ移行したファイル同士を比較できない。

`confdiff` はこうした見た目上のノイズをすべて無視し、**意味のある変更だけ**を報告します。各変更は、明確なパス・旧値・新値とともに1行で表示されます。

## 主な特徴

- **8つのフォーマットを1つのツールで:** JSON（`tsconfig.json` などの**コメント付きJSON**、`.jsonc`、`//` や `/* */`、末尾カンマにも対応）、YAML、TOML、INI/`.cfg`/`.conf`、`.env`、Java `.properties`、CSV/TSV、XML（`.xml`/`.svg`/`.plist` など）。拡張子から自動判定し、内容による推測もフォールバックします。
- **フォーマットをまたいだ比較:** `config.json` と移行後の `config.yaml` を比較し、内容が等価であることを確認できます。
- **ディレクトリ全体の差分:** 2つの*ディレクトリ*を指定すると、相対パスで設定ファイルを再帰的に対応付け、追加・削除・意味的変更のあったファイルを表示します。2つのHelmレンダリング結果や、環境ごとの設定ツリーの比較に最適です。
- **複数ドキュメントのYAML:** `---` 区切りのファイル（Kubernetesマニフェスト、`kubectl get -o yaml`、Helmレンダー）をドキュメントのリストとして解析し、ドキュメント単位で比較します。
- **CSV/TSV を行単位で比較:** 区切り文字（`,` `\t` `;` `|`）を自動判定し、RFC 4180 のクォートを処理します。`--csv-key <列>` で列をキーにして行を対応付ければ、並び替えられた行を差分として扱いません。
- **シークレットを漏らさない差分（`--redact`）:** パスワードやトークンなどの秘密の値を、安定したフィンガープリントとしてマスクします。値そのものをPRコメントやCIログに出さずに、「何かが変わった」ことだけを確認できます。他の設定差分ツールにはない機能です。

```console
$ confdiff prod.env staging.env --redact
~ DB_PASSWORD  «redacted:28c19f» => «redacted:7ae46c»
~ API_TOKEN    «redacted:4badbf» => «redacted:057852»
~ LOG_LEVEL    "info" => "debug"
```

## インストール

```console
# npx で即実行（インストール不要）
npx confdiff old.yaml new.yaml

# グローバルインストール
npm install -g confdiff

# Homebrew
brew install esperanza-volkov/confdiff/confdiff
```

Node.js 18 以上が必要です。ランタイム依存ゼロ。

## 基本的な使い方

```console
# 2つのファイルを比較
confdiff old.json new.json

# ディレクトリ全体を比較
confdiff old-manifests/ new-manifests/

# シークレットをマスクして比較
confdiff prod.env staging.env --redact

# JSON形式で出力（CI・スクリプト向け）
confdiff a.yaml b.yaml --json
```

差分があると終了コード `1`、差分がなければ `0` を返すため、CIのガードにそのまま使えます（`--exit-zero` で常に0にできます）。

主なオプション:

| オプション | 説明 |
| --- | --- |
| `--redact` | 秘密の値を安定フィンガープリントでマスク |
| `--json` | 機械可読なJSONで差分を出力 |
| `--quiet` | 出力なし・終了コードのみで結果を伝える |
| `--exit-zero` | 差分があっても常に終了コード0を返す |
| `--csv-key <列>` | CSVの行を指定列で対応付け |
| `--ignore <パス>` | 指定パスを無視（繰り返し指定可） |

すべてのオプションと詳細な例は、英語版の **[README.md](./README.md)** を参照してください。

## AIエージェント向け（MCPサーバー）

confdiff は Model Context Protocol (MCP) サーバーとしても利用でき、LLMエージェントが設定ファイルを意味的に比較できます。

```console
npx confdiff-mcp
```

公式 MCP レジストリに `io.github.esperanza-volkov/confdiff-mcp` として登録されています。詳細は英語版READMEの MCP セクションをご覧ください。

## ライセンス

[MIT](./LICENSE)

---

*このツールが役に立ったら、[GitHub でスターを付けて](https://github.com/esperanza-volkov/confdiff)いただけると励みになります。バグ報告や要望は Issue でお気軽にどうぞ。*
