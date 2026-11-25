# ダンジョンマスター SFC日本語版パッチ

入口や扉付近でゲームが止まる不具合を修正し、床にアイテムが多い場面での描画待ちを短くします。既存のゲーム内セーブを引き続き使えます。

## 対応するROMとパッチ

| 日本語版のリビジョン | 元ROMのCRC32 | SlowROM | FastROM |
| --- | --- | --- | --- |
| **Rev 0（初版）** | `7A1BA194` | [Rev 0 SlowROM](patches/DM-JP-rev0-slowrom.bps) | [Rev 0 FastROM](patches/DM-JP-rev0-fastrom.bps) |
| **Rev 1（後期版）** | `AA79FA33` | [Rev 1 SlowROM](patches/DM-JP-rev1-slowrom.bps) | [Rev 1 FastROM](patches/DM-JP-rev1-fastrom.bps) |

ヘッダーなしの1 MiB ROMが対象です。元ROMのCRC32を表で確認し、該当する行からBPSパッチを1つ選んで適用してください。既存セーブを使う場合は、セーブファイルをコピーして、適用済みROMと同じベース名にします。

SlowROM版は元のROMアクセス速度のまま描画を高速化します。FastROM版はROMの読み出しも速くします。どちらも元のDSP-2を使います。FastROM版を実機で使うには、FastROMの読み出し速度に対応するカートリッジ環境が必要です。 [Nintendo SNES Development Manual](https://floating.muncher.se/bot/manual/book1_text.pdf)

## 修正される不具合

- **炎の杖で入口がフリーズする（Rev 0）**。未完成の炎の杖を装備または手カーソルに持って入口へ戻ると起きる停止と、それに伴うセーブ破損を修正します。 [Dungeon Master Encyclopaedia](http://dmweb.free.fr/?q=node/620#toc18)
- **シーブズ・アイの効果中にフリーズする（両版）**。効果中に扉の下に立ち、壁を向いたときに起きる停止を修正します。 [Dungeon Master Encyclopaedia](http://dmweb.free.fr/?q=node/620)
- **ギグラーが盗んだときにアイテムが重複する（両版）**。宝箱から取り出した品を盗まれたときに、後続の品までギグラーの所持品に入ることを防ぎます。 [Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?t=31348)
- **ロードのたびに持ち物が重くなる（両版）**。手カーソルに品を持った状態でセーブしたとき、その品の重さがロード時に二重に加算される処理を修正します。 [Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?t=31337)
- **格子扉の取っ手が浮いて見える（両版）**。角型・アーチ型の取っ手が格子の横桟に合うようにします。 [Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?p=165897)

## 描画の速さ

床のアイテムの位置計算を短縮し、展開済みの画像を再利用します。Snes9xのNTSC設定で、同じ場面の最初の視界描画にかかる時間を計測しました。

| 視界に入るアイテム数 | 元ROM | SlowROM | FastROM |
| ---: | ---: | ---: | ---: |
| 3個 | 429 ms | 397 ms | 373 ms |
| 27個 | 862 ms | 628 ms | 591 ms |
| 99個 | 2,218 ms | 1,224 ms | 1,153 ms |
| 195個 | **4,033 ms** | **1,705 ms** | **1,596 ms** |

Snes9xで両版のバグ修正とセーブの読み戻しを確認しています。実機での動作は未検証です。

## パッチを生成する

Node.js 24で、元ROMからBPSパッチを生成できます。入力には手元のROMへのパスを指定してください。

```powershell
node dm-sfc.mjs patch '<元ROMのパス>' 'patched-slowrom.bps' --crowded-render-slowrom
node dm-sfc.mjs patch '<元ROMのパス>' 'patched-fastrom.bps' --crowded-render
```

出力の拡張子を `.sfc` にすると適用済みROMを生成します。
