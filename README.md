# ダンジョンマスター SFC 日本版パッチ

| 元ROM | CRC32 | バグ修正と描画高速化 r4（SlowROM） | バグ修正と描画高速化 r4（FastROM） |
| --- | --- | --- | --- |
| `Dungeon Master (Japan).sfc`（v1.0） | `7A1BA194` | [v1.0 SlowROM](patches/DM-JP-v1.0-fixes-crowded-render-slowrom-r4.bps) | [v1.0 FastROM](patches/DM-JP-v1.0-fixes-fast-crowded-render-r4.bps) |
| `Dungeon Master (Japan) (Rev 1).sfc`（v1.1） | `AA79FA33` | [v1.1 SlowROM](patches/DM-JP-v1.1-fixes-crowded-render-slowrom-r4.bps) | [v1.1 FastROM](patches/DM-JP-v1.1-fixes-fast-crowded-render-r4.bps) |

ヘッダーなしの1 MiB ROMが対象です。BPS対応のパッチ適用ツールで、表にある元ROMとパッチを組み合わせてください。既存の進行を使うときは、セーブファイルのコピーを出力ROMと同じベース名にします。

Node.js 24で差分の確認と、パッチまたは適用済みROMの生成ができます。出力先に同名ファイルがある場合はエラーになります。

```powershell
node dm-sfc.mjs compare
node dm-sfc.mjs patch 'Dungeon Master (Japan).sfc' 'DM-JP-v1.0-fixes-crowded-render-slowrom-r4.bps' --crowded-render-slowrom
node dm-sfc.mjs patch 'Dungeon Master (Japan).sfc' 'DM-JP-v1.0-fixes-fast-crowded-render-r4.bps' --crowded-render
node dm-sfc.mjs patch 'Dungeon Master (Japan) (Rev 1).sfc' 'DM-JP-v1.1-fixes-crowded-render-slowrom-r4.bps' --crowded-render-slowrom
node dm-sfc.mjs patch 'Dungeon Master (Japan) (Rev 1).sfc' 'DM-JP-v1.1-fixes-fast-crowded-render-r4.bps' --crowded-render
```

出力ファイル名の拡張子を `.sfc` にすると適用済みROMを生成します。両版とも `--fix-only` でバグ修正のみを適用できます。

## 炎の杖と版差

Snes9xで有効なゲーム内セーブを作成し、検証用に未完成の炎の杖を所持させて、入口手前の `(1,5)` から `(1,4)` に歩きました。v1.0では装備欄と手カーソルの両方で停止とセーブ破損が発生し、装備欄のケースでは再起動後のロードエラーも確認しました。v1.1では同じ入力の後も移動でき、SRAMの32 KiBが全バイト一致しました。この版差は既存の報告とも一致します。[Dungeon Master Encyclopaedia](http://dmweb.free.fr/?q=node/620#toc18)

v1.0の入口センサーは、パーティがいるマスでテキストが有効になると `$07:A8C2` と `$07:A8D4` から処理を呼び出します。v1.1はこの2つの呼び出しを省いています。v1.0用パッチは2命令を `NOP` に置き換えます。修正後のv1.0と高速化したv1.1で、リブラスルス出現後まで進み、再起動後に元のセーブをロードできることを確認しました。

同じファイル位置で比較した差分は32バンク中10バンクの計21,106バイトです。うち19,739バイトはバンク `$07` にあります。このバンクでは呼び出し2命令の削除を境に後続のコードやデータが8バイト前に移動し、呼び出し先などのアドレスも調整されています。ヘッダーの版番号とチェックサムも異なります。

Hissssaの所持品画面で前の勇者名の末尾が残る件は、v1.0で発生し、v1.1で修正されたと報告されています。[Dungeon Master Encyclopaedia](http://dmweb.free.fr/?q=node/620)

## シーブズ・アイ

Snes9xで地上階の扉の下に立ち、`LO OH EW RA` を唱えて扉枠に向きました。日本版v1.0とv1.1の両方で緑の帯が出て、画像用の作業メモリが不足したところで停止しました。[Dungeon Master Encyclopaedia](http://dmweb.free.fr/?q=node/620)

扉枠を合成する際の画像幅と透明色を修正し、展開した透視用画像を描画のたびに解放します。4本のr4パッチで、透視の円、効果時間の終了、終了後の旋回を確認しました。検証に使った地上階の扉は、透視の効果がないときの描画フレームが修正前後で一致しました。

## r2で追加した修正

- **ギグラーの盗みでアイテムが重複する。** 宝箱の先頭から取り出した薬を、所持品が空のギグラーに盗ませて再現しました。盗んだ薬の参照先をリスト終端に設定し、宝箱の巻物がギグラーの所持品に混ざるのを防ぎます。両版で盗みの直後と再起動してロードした後に、巻物が宝箱だけにあることを確認しました。[Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?t=31348)
- **手カーソルに物を持って保存すると重量が増える。** ロード時に手カーソルの品の重量を加算するのは、リーダーを復元したときの1回だけにしました。両版で、こんぼうを持ったまま保存とロードを繰り返しても5.6 kgのままでした。[Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?t=31337)
- **格子扉の取っ手が浮いて見える。** 角型とアーチ型の取っ手が共有する描画座標を、描画距離ごとに格子の横桟に合わせました。報告の3枚を両版で確認しました。[Dungeon Master Forum](https://www.dungeon-master.com/forum/viewtopic.php?p=165897)

ゲーム内セーブは従来の形式です。既存セーブに記録済みの重複や余分な重量は自動修復の対象外です。

## 描画高速化

ダンジョンの視界をタイルへ変換する処理を `$80:9858` のFastROMミラーで実行します。ROMヘッダーはLoROMの `$20` を使い、DSP-2のI/Oは `$3F` バンクで行います。Snes9xのNTSC計測では、同じ入口付近の移動入力でタイル変換の所要時間が **約75 msから64〜65 ms** になりました。測定区間は描画ルーチンの入口から変換完了までです。

日本版の元ROMはv1.0・v1.1ともSlowROM指定（`$20`）です。SlowROM版は元と同じROMアクセス速度で動作します。実機でのFastROM動作には対応する読み出し速度のROMが必要です。いずれも元から使われているDSP-2が必要です。検証環境はSnes9xです。[Nintendo SNES Development Manual](https://floating.muncher.se/bot/manual/book1_text.pdf)

### 敵やアイテムが多い場面

密集場面向けの版は、ROM内の画像695件の位置をテーブルから直接引きます。圧縮画像の展開では、展開済みの部分を参照するコピーに65C816のブロック転送を使います。コピーがバンク境界をまたぐ場合は元の処理を使います。

v1.1のr2では、Snes9xのNTSC設定で同じ状態から描画を開始し、視界描画の入口からタイル変換完了までの時間を比較しました。

| 場面 | タイル変換の高速化版 r2 | 密集場面向け r2 | 短縮率 |
| --- | ---: | ---: | ---: |
| 敵が複数いる部屋 | 657 ms | 564 ms | 14% |
| 敵とアイテムが見える通路 | 463 ms | 414 ms | 11% |
| アイテム3個を置いた床 | 352 ms | 323 ms | 8% |
| 同じ床にアイテム27個を置いた検証用の場面 | 813 ms | 625 ms | 23% |

比較した視界のフレームと、最初の描画で展開した画像のハッシュは前回版と一致しました。密集場面向けでも、炎の杖を入口へ持ち帰った後のセーブ領域32 KiBが一致し、再起動後に元のセーブを読み込めました。

### r3の測定結果

r3では同じ床マス内の同じ位置に重なったアイテムに、展開・拡縮済みのスプライト画像を再利用します。画像は空き容量に余裕がある場合に限って本体のWRAMに置き、描画中に解放します。圧縮されていない連続バイトの転送と、透明色10を使うスプライトの合成も短縮しました。

v1.1の同じ床に検証用アイテムを置き、Snes9xのNTSC設定で最初の視界描画を計測しました。

| アイテム数 | 元ROM | r2 FastROM | r3 SlowROM | r3 FastROM |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 429 ms | 380 ms | 399 ms | 374 ms |
| 27 | 862 ms | 655 ms | 668 ms | 632 ms |
| 99 | 2,218 ms | 1,537 ms | 1,426 ms | 1,356 ms |
| 195 | 4,033 ms | 2,717 ms | 2,041 ms | 1,936 ms |

この4場面と敵がいる場面を含む計8場面で、両方のr3の視界描画はr2と画素単位のハッシュが一致しました。

### r4の測定結果

床のアイテムの表示座標を描画用テーブルから直接求めます。画像キャッシュを画像番号で引き、アイテムだけの床マスでは位置が違っても同じ画像を再利用します。キャッシュに空きがある範囲で画像を詰めて格納し、キャッシュが有効な間はアイテム一覧の次の参照先も直接求めます。

| アイテム数 | r3 SlowROM | r4 SlowROM | r3 FastROM | r4 FastROM |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 399 ms | 397 ms | 374 ms | 373 ms |
| 27 | 668 ms | 628 ms | 632 ms | 591 ms |
| 99 | 1,426 ms | 1,224 ms | 1,356 ms | 1,153 ms |
| 195 | 2,041 ms | 1,705 ms | 1,936 ms | 1,596 ms |

表の測定値はv1.1のものです。v1.0でも同じ4場面でミリ秒単位の測定値と視界の画素が一致しました。195個の場面は両版とも、元ROMの4,033 msからSlowROMで1,705 ms、FastROMで1,596 msに短縮しました。

v1.1のr3とr4を計61場面で比較したところ、床のアイテムを拾える位置と対象はすべて一致し、視界の画素は59場面で一致しました。残る2場面の描画差は、r3の実行タイミングを待ち命令だけで変えても再現しました。敵だけが多い場面の描画時間はr3とほぼ同じでした。
