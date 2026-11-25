import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { crc32 } from 'node:zlib';
import { patchPileRendering } from './pile-render.mjs';

const revisions = [
  {
    version: '1.0',
    filename: 'Dungeon Master (Japan).sfc',
    sha256: '5c5e49edd42f3f9d1dac0f6dd484b6bdc27c2d2b012d1ce798371861a3744703',
  },
  {
    version: '1.1',
    filename: 'Dungeon Master (Japan) (Rev 1).sfc',
    sha256: '35ff99319ecc7ce1216c5096f46fcc11659254d570614d683f0f8ef773ed75b8',
  },
];

function readRom(filename) {
  const bytes = readFileSync(filename);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const revision = revisions.find((candidate) => candidate.sha256 === sha256);
  if (!revision) {
    throw new Error(`${filename} は対応する日本版のヘッダーなしROMと一致しません (${sha256})`);
  }
  return { bytes, revision };
}

function replace(rom, address, original, replacement) {
  const offset = ((address >>> 16) * 0x8000) + (address & 0x7fff);
  const before = Buffer.from(original, 'hex');
  const after = Buffer.from(replacement, 'hex');
  if (before.length !== after.length || !rom.subarray(offset, offset + before.length).equals(before)) {
    throw new Error(`ROMの内容が $${address.toString(16).padStart(6, '0')} で一致しません`);
  }
  after.copy(rom, offset);
}

function patchThievesEye(rom) {
  // The door frame is 24×123 pixels, packed at 4 bits per pixel.
  replace(rom, 0x03c970, 'f4b007', 'f4c405'); // Copy 12 × 123 bytes.
  // The 72-pixel hole graphic uses color 6 outside the window and color 10
  // inside it. The final door blit treats color 10 as transparent.
  replace(rom, 0x03c98c, 'f40900', 'f40600');
  replace(rom, 0x03c98f, 'f41000', 'f40c00'); // Door frame stride: 12 bytes.
  replace(rom, 0x03c992, 'f43000', 'f42400'); // Hole graphic stride: 36 bytes.

  // Release decoded graphic $0202 before drawing the composited frame.
  // Tail-jump to the original blitter with its argument stack in place.
  replace(rom, 0x03c9e2, '2284a203', '2260fc00');
  replace(rom, 0x00fc60, '0000000000000000', '225581015c84a203');
}

function patchGigglerTheft(rom) {
  // Linking an item to a nonempty group already clears the item's next link.
  // Do the same on the first theft before continuing with the original code.
  replace(rom, 0x02d6fe, '97fb8016', '5ca0fc00'); // JML $00:FCA0
  const firstTheft = [
    '97fb',       // STA [$FB],Y (original write of the group's inventory head)
    '08da5a4848', // Save P, X, Y, and A, then pass the item ID.
    '22a1c6017a', // Resolve the item ID to its address in X:A and drop the argument.
    '85f086f2',   // Put the address in the caller's temporary pointer.
    'a9feff87f0', // Clear the item's next link.
    '687afa28',   // Restore the registers and flags.
    '5c18d702',   // JML $02:D718
  ].join('');
  replace(rom, 0x00fca0, '00'.repeat(firstTheft.length / 2), firstTheft);
}

function patchLeaderHandWeight(rom) {
  // A save stores the leader's load without the cursor item. The load path
  // restores the item and then reselects the saved leader. Leave the leader
  // temporarily unset for the first operation so only reselection adds weight.
  replace(rom, 0x05a938, 'f40100d4e02263cf05', '5ce0fc00eaeaeaeaea');
  const restoreCursorItem = [
    'adbac348',           // Save the leader index.
    'a9ffff8dbac3',       // Set the current leader to none.
    'f40100d4e02263cf05', // Restore the cursor item through the original call.
    '7a7a688dbac3',       // Drop the arguments and restore the leader index.
    '5c43a905',           // Continue to the original leader reselection.
  ].join('');
  replace(rom, 0x00fce0, '00'.repeat(restoreCursorItem.length / 2), restoreCursorItem);
}

function patchPortcullisOrnaments(rom) {
  // The two grid ornaments share coordinate set 0. Align their bottom edge
  // with the crossbar of the portcullis at each of the three view distances.
  replace(rom, 0x038be9, [
    '0c170811060a', // D3: x1, x2, y1, y2, byte width, height
    '101f0b170c0d', // D2
    '182f0d1f0c13', // D1
  ].join(''), [
    '0c170b14060a', // D3: y + 3
    '101f101c0c0d', // D2: y + 5
    '182f17290c13', // D1: y + 10
  ].join(''));
}

function patchCrowdedRendering(rom) {
  // The graphic directory begins at $01:83D0 in both revisions. A graphic that would
  // reach or cross the bank boundary starts at $8000 in the next bank.
  const directory = 0x83d0;
  const graphicCount = rom.readUInt16LE(directory);
  const locations = Buffer.alloc(graphicCount * 4);
  let bank = 0x09;
  let address = 0x8000;
  for (let id = 0; id < graphicCount; id += 1) {
    const length = rom.readUInt16LE(directory + 2 + 2 * id);
    if (address + length >= 0x10000) {
      bank += 1;
      address = 0x8000;
    }
    locations.writeUInt16LE(address, id * 4);
    locations.writeUInt16LE(bank, id * 4 + 2);
    address += length;
  }

  // The last packed graphic in bank $12 ends at $F000. Use its padding for
  // the helpers and the new directory, leaving all existing graphic data in place.
  replace(rom, 0x12f040, '00'.repeat(locations.length), locations);
  replace(rom, 0x01805d, 'a00000a600', '5c00f092ea'); // JML $92:F000 / NOP
  const lookup = [
    'a500c9', Buffer.from([graphicCount & 0xff, graphicCount >>> 8]).toString('hex'),
    'b01a',               // LDA $00 / CMP #graphicCount / BCS original scan
    '0a0aaa',             // Multiply the graphic ID by 4 and place the offset in X.
    'bf40f0928520',       // Load the packed graphic address into $20.
    'bf42f0928522',       // Load its bank into $22.
    'a5000aa8a20000',     // Replay the scan's final Y = ID * 2 and X = 0.
    '5c848001',           // JML $01:8084
    'a00000a6005c628001', // Original LDY #0 / LDX $00 / JML $01:8062
  ].join('');
  replace(rom, 0x12f000, '00'.repeat(lookup.length / 2), lookup);

  // Copy LZ back-references with a forward block move. That keeps the original
  // overlap semantics. Use the byte loop when either range crosses a bank,
  // when the copy count is zero, or when the buffer is outside WRAM.
  replace(rom, 0x009cdc, 'a6025aa00000', '5c80fb92eaea'); // JML $92:FB80
  const backReference = [
    'a502f03f3a186528b039', // Check for zero count and source bank crossing.
    'a5023a186524b031',     // Check for destination bank crossing.
    'a526c97e00f013',       // Select WRAM bank $7E.
    'c97f00d025',           // Otherwise use $7F or fall back to the byte loop.
    '5a8ba628a424a5023a',   // Save Y and DB. X = source; Y = destination; A = count - 1.
    '547f7f800c',           // MVN $7F,$7F / BRA done
    '5a8ba628a424a5023a',
    '547e7e',               // MVN $7E,$7E
    'ab84247aa20000',       // Restore DB, update $24, restore Y, clear X.
    '5ca39c00',             // JML $00:9CA3 (next command)
    'a6025aa000005ce29c00', // Original LDX $02 / PHY / LDY #0 / JML $00:9CE2
  ].join('');
  replace(rom, 0x12fb80, '00'.repeat(backReference.length / 2), backReference);

  // Run the sprite blitter in its FastROM mirror. Replay the overwritten
  // prologue with the caller's stack intact so its RTL returns as before.
  replace(rom, 0x0485d2, '0b3b38e9e500', '5cd0fb92eaea');
  replace(rom, 0x12fbd0, '00'.repeat(10), '0b3b38e9e5005cd88584');
}

function patchRom({ bytes, revision }, mode) {
  const rom = Buffer.from(bytes);
  const crowded = mode === '--crowded-render' || mode === '--crowded-render-slowrom';
  patchThievesEye(rom);
  patchGigglerTheft(rom);
  patchLeaderHandWeight(rom);
  patchPortcullisOrnaments(rom);
  if (revision.version === '1.0') {
    // v1.1 omits these calls when an inscription is activated under the party.
    // Preserve v1.0's argument pushes, stack cleanup and bank layout.
    replace(rom, 0x07a8c2, '22d4d301', 'eaeaeaea');
    replace(rom, 0x07a8d4, '22fff600', 'eaeaeaea');
  }
  if (crowded || (revision.version === '1.1' && mode !== '--fix-only')) {
    if (mode !== '--crowded-render-slowrom') {
      // Enable MEMSEL during reset. Restore the accumulator and flags
      // before jumping to the original reset continuation.
      replace(rom, 0x00806c, '5c2fd400', '5c20fc80');
      replace(rom, 0x00fc20, '00'.repeat(18), [
        '0848',         // PHP / PHA (16-bit accumulator at the reset hook)
        'e220a901',     // SEP #$20 / LDA #$01
        '8f0d4200',     // STA.l $00420D
        'c2206828',     // REP #$20 / PLA / PLP
        '5c2fd400',     // JML $00D42F
      ].join(''));
    }
    // Use the upper LoROM mirror for viewport conversion. It runs at
    // FastROM speed when MEMSEL is enabled.
    replace(rom, 0x0383dd, '22589800', '22589880');
    if (crowded) {
      patchCrowdedRendering(rom);
      patchPileRendering(rom, replace);
    }
  }

  // The four checksum bytes contribute $01FE when stored as a complementary pair.
  const checksum = rom.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  rom.writeUInt16LE(checksum ^ 0xffff, 0x7fdc);
  rom.writeUInt16LE(checksum, 0x7fde);
  return rom;
}

function bpsNumber(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push(value % 0x80);
    value = Math.floor(value / 0x80) - 1;
  }
  bytes.push(value + 0x80);
  return Buffer.from(bytes);
}

function bpsPatch(source, target) {
  const chunks = [Buffer.from('BPS1'), bpsNumber(source.length), bpsNumber(target.length), bpsNumber(0)];
  let offset = 0;
  while (offset < target.length) {
    const start = offset;
    const changed = source[offset] !== target[offset];
    do {
      offset += 1;
    } while (offset < target.length && (source[offset] !== target[offset]) === changed);
    chunks.push(bpsNumber((offset - start - 1) * 4 + Number(changed)));
    if (changed) chunks.push(target.subarray(start, offset));
  }
  const footer = Buffer.alloc(12);
  footer.writeUInt32LE(crc32(source), 0);
  footer.writeUInt32LE(crc32(target), 4);
  const patch = Buffer.concat([...chunks, footer]);
  patch.writeUInt32LE(crc32(patch.subarray(0, -4)), patch.length - 4);
  return patch;
}

function compareRoms(files) {
  const [early, late] = revisions.map((revision, index) => readRom(files[index] ?? revision.filename));
  if (early.revision.version !== '1.0' || late.revision.version !== '1.1') {
    throw new Error('入力の順番は v1.0、v1.1 です');
  }
  for (const { bytes, revision } of [early, late]) {
    const crc = crc32(bytes).toString(16).toUpperCase().padStart(8, '0');
    console.log(`v${revision.version}  ${bytes.length} bytes  CRC32 ${crc}`);
  }

  let total = 0;
  for (let offset = 0; offset < early.bytes.length; offset += 0x8000) {
    let changed = 0;
    for (let i = offset; i < offset + 0x8000; i += 1) {
      if (early.bytes[i] !== late.bytes[i]) changed += 1;
    }
    if (changed === 0) continue;
    total += changed;
    const bank = (offset / 0x8000).toString(16).toUpperCase().padStart(2, '0');
    console.log(`$${bank}:8000–FFFF  ${changed}`);
  }
  console.log(`差分合計 ${total} バイト`);
}

try {
  const [command, ...args] = process.argv.slice(2);
  const patchModes = ['--fix-only', '--crowded-render', '--crowded-render-slowrom'];
  if (command === 'compare' && (args.length === 0 || args.length === 2)) {
    compareRoms(args);
  } else if (command === 'patch' &&
    (args.length === 2 || (args.length === 3 && patchModes.includes(args[2])))) {
    const [input, output, flag] = args;
    const extension = extname(output).toLowerCase();
    if (extension !== '.sfc' && extension !== '.bps') throw new Error('出力は .sfc または .bps を指定してください');
    const source = readRom(input);
    const target = patchRom(source, flag);
    writeFileSync(output, extension === '.bps' ? bpsPatch(source.bytes, target) : target, { flag: 'wx' });
    console.log(`v${source.revision.version} → ${output}`);
  } else {
    console.log('node dm-sfc.mjs compare [v1.0.sfc v1.1.sfc]');
    console.log('node dm-sfc.mjs patch <original.sfc> <patched.sfc|patch.bps> [--fix-only|--crowded-render|--crowded-render-slowrom]');
    process.exitCode = command === '--help' ? 0 : 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
