export function patchPileRendering(rom, replace) {
  const codeAddress = 0x9ce200;
  const code = [];
  const labels = new Map();
  const references = [];
  const emit = (hex) => code.push(...Buffer.from(hex, 'hex'));
  const label = (name) => labels.set(name, code.length);
  const branch = (opcode, name) => {
    code.push(opcode, 0);
    references.push({ offset: code.length - 1, name, relative: true });
  };
  const addressWord = (name, adjustment = 0) => {
    references.push({ offset: code.length, name, adjustment });
    emit('0000');
  };
  const call = (name) => {
    emit('20');
    addressWord(name);
  };
  const longAddress = (name) => {
    const address = codeAddress + labels.get(name);
    return Buffer.from([address & 0xff, address >> 8 & 0xff, address >> 16]).toString('hex');
  };

  // These direct-page locals belong to the existing object-rendering frame.
  // $34 is the cache base, $36 the entry address, $38 the transform key,
  // $3A the hit flag, $3C the next free entry, and $3E the item count.
  // $42 and $44 bound the next bitmap. $46 points to the current image's list.
  // Reserve 512 bytes for 64 entries, 178 for the lists, and 16 KiB for bitmaps.
  label('initCell');
  emit('64a464a664345ccbd003'); // Replay STZ $A4 / STZ $A6 at the tile entry.

  label('beginCell');
  emit('85ac643e643a645a5c9bd103');

  label('endCell');
  emit('a534');
  branch(0xf0, 'continueCell');
  emit('a5a8c9ffff'); // A creature can need more of the graphics arena.
  branch(0xd0, 'releaseCell');
  emit('a5580540'); // Release before effects or projectiles as well.
  branch(0xf0, 'continueCell');
  label('releaseCell');
  call('releaseSpace');
  label('continueCell');
  emit('a5e8c904005c23d803'); // LDA $E8 / CMP #$0004 / continue

  label('finishTile');
  call('releaseSpace');
  emit('9c90c3a5405c83e603'); // Original start of the last projectile pass.

  label('releaseSpace');
  emit('a534');
  branch(0xf0, 'cellEnded');
  emit('6434643a');
  emit('ad519d1869b2428d519d'); // Restore the graphics stack pointer.
  emit('ad599d1869b2428d599d'); // Restore the bytes available.
  label('cellEnded');
  emit('60');

  label('unscaled');
  call('probe');
  branch(0x90, 'loadUnscaled');
  emit('a00200b7de29ff0085c8a00300b7de29ff0085c6'); // Original width and height.
  emit('5c07d503'); // Bitmap is already mirrored if needed.
  label('loadUnscaled');
  emit('d4e622c490015c66d303'); // Original PEI $E6 / JSL $0190C4.

  label('scaled');
  call('probe');
  branch(0x90, 'loadScaled');
  emit('5c07d503'); // The size, scale and flip already match.
  label('loadScaled');
  emit('d4e622c490015cadd403');

  label('releaseBitmap');
  emit('a55a'); // Projectiles use the original allocation and release path.
  branch(0xd0, 'releaseOriginal');
  emit('a53a');
  branch(0xd0, 'skipRelease');
  label('releaseOriginal');
  emit('5c558101');
  label('skipRelease');
  emit('6b');

  label('storeBitmap');
  emit('a53a');
  branch(0xd0, 'storeSkipped');
  emit('a536');
  branch(0xf0, 'storeSkipped');
  emit('a5e4c97f00'); // Only cache bitmaps wholly in graphics WRAM bank $7F.
  branch(0xf0, 'storeWram');
  label('storeSkipped');
  emit('4c'); // JMP
  addressWord('storeDone');
  label('storeWram');
  emit('ad90c3');
  branch(0xf0, 'unscaledStride');
  emit('a5c81869070029f8ff'); // Round the scaled row stride up to 8 bytes.
  branch(0x80, 'findSize');
  label('unscaledStride');
  emit('a5c8');
  label('findSize');
  emit('d4c61822'); // Width × height.
  addressWord('multiplySmall');
  emit('9c7ac90102');
  branch(0xb0, 'storeDone');
  emit('c90000');
  branch(0xf0, 'storeDone');
  emit('3a481865e2'); // Save count - 1 and check the last source address.
  branch(0xb0, 'discardCount');
  emit('a542186301'); // Check the last cached byte against the end of the arena.
  branch(0xb0, 'discardCount');
  emit('c544');
  branch(0xb0, 'discardCount');
  emit('1aa8a5428442'); // Keep the current start in A until recorded below.
  emit('a6369f06007f'); // Entry + 6 = start of bitmap.
  emit('a8a6e2688b547f7fab'); // Y = cache, X = original, A = count - 1, MVN.
  emit('a646bf00007fa6369f00007f'); // Link to the previous entry for this image.
  emit('a5de9f02007fa5389f04007f');
  emit('a536a6469f00007f'); // Publish the new head after storing the bitmap.
  emit('a53c18690800853c'); // Commit the newly filled entry.
  branch(0x80, 'storeDone');
  label('discardCount');
  emit('68');
  label('storeDone');
  emit('a7ce29ff005c0cd503'); // Continue with the original item placement.

  label('probe');
  emit('643a6436a55a');
  branch(0xd0, 'miss');
  // Graphics $011F through $0177 each take at most 3,530 decoded bytes.
  // Release the reservation before attempting any other graphic.
  emit('a5e638e91f01c95900');
  branch(0xb0, 'outsideItemGraphics');
  emit('a534');
  branch(0xd0, 'lookup');
  emit('e63ea53ec90500'); // Leave small groups of items on the original path.
  branch(0xd0, 'miss');
  call('reserve');
  emit('a534');
  branch(0xf0, 'miss');
  label('lookup');
  emit('a5ba0a0a05aa8538'); // Key from scale and horizontal mirror.
  emit('a5e638e91f010a186534186900028546aabf00007faa');
  label('scanEntry');
  emit('e00000');
  branch(0xf0, 'cacheNew');
  emit('bf02007fc5de'); // The aspect also identifies the original bitmap dimensions.
  branch(0xd0, 'nextEntry');
  emit('bf04007fc538');
  branch(0xd0, 'nextEntry');
  emit('bf06007f85e2a97f0085e4e63a3860');
  label('nextEntry');
  emit('bf00007faa');
  branch(0x80, 'scanEntry');
  label('cacheNew');
  emit('a53c38e534c90002');
  branch(0xb0, 'miss');
  emit('a53c8536');
  label('miss');
  emit('1860');
  label('outsideItemGraphics');
  call('releaseSpace');
  emit('1860');

  // Reserve part of the original graphics arena only while drawing floor
  // items. Leave at least 8 KiB below it for the decoder and resize buffer.
  // Reuse bitmaps across quadrants when the tile contains only floor items.
  label('reserve');
  emit('ad539dc97f00');
  branch(0xd0, 'noSpace');
  emit('ad5b9d');
  branch(0xd0, 'noSpace');
  emit('ad519dc9b262');
  branch(0x90, 'noSpace');
  emit('ad599dc9b262');
  branch(0x90, 'noSpace');
  emit('38e9b2428d599d');
  emit('ad519d854438e9b2428d519d8534853c18690002');
  emit('da5a8ba8a2');
  addressWord('emptyHeads');
  emit('a9b100547f9cab7afa'); // Clear the per-image list heads with MVN.
  emit('a5341869b2028542');
  label('noSpace');
  emit('60');

  // Most dungeon sprites use color 10 as the transparent nibble. Use the
  // original mask table directly and leave the DSP path for wide aligned rows.
  label('selectBlit');
  emit('a500c90a00');
  branch(0xd0, 'originalBlit');
  emit('a5d845d6');
  branch(0xf0, 'alignedBlit');
  emit('a5d8');
  branch(0xf0, 'rightBlit');
  call('leftBlit');
  emit('5c908a84'); // Original blitter epilogue at $84:8A90.
  label('alignedBlit');
  emit('a5dac90900');
  branch(0xb0, 'originalBlit');
  call('alignedRows');
  emit('5c908a84');
  label('rightBlit');
  emit('a5eb38e9010085eb'); // Read the preceding aligned byte for a right shift.
  branch(0xb0, 'rightRowsReady');
  emit('c6ed');
  label('rightRowsReady');
  call('rightRows');
  emit('5c908a84');
  label('originalBlit');
  emit('a5d845d65cff8784');

  const emitRows = (name, loadPixel) => {
    label(name);
    emit('e230');
    label(name + 'Row');
    emit('a4da');
    branch(0xf0, name + 'Last');
    emit(loadPixel);
    emit('aa51ef3f1ca48425de51ef91ef88'); // First byte, including the left clip mask.
    branch(0xf0, name + 'Last');
    label(name + 'Middle');
    emit(loadPixel);
    emit('c9aa');
    branch(0xf0, name + 'Next');
    emit('aa51ef3f1ca48451ef91ef');
    label(name + 'Next');
    emit('88');
    branch(0xd0, name + 'Middle');
    label(name + 'Last');
    emit(loadPixel);
    emit('aa51ef3f1ca48425df51ef91ef'); // Last byte, including the right clip mask.
    emit('c23018a5eb65fb85eb');
    if (name !== 'alignedRows') {
      branch(0x90, name + 'Destination');
      emit('e6ed');
    }
    label(name + 'Destination');
    emit('18a5ef65fd85efc6dce230');
    branch(0xd0, name + 'Row');
    emit('60');
  };

  emitRows('alignedRows', 'b7eb');
  emitRows('leftBlit', 'c220b7ebeb0a0a0a0ae220eb');
  emitRows('rightRows', 'c220b7ebeb4a4a4a4ae220');

  // The 65C816 block move has fixed bank operands, so select a stub for the
  // packed graphic's ROM bank and its WRAM destination. Short runs and
  // bank crossings keep their original byte loop.
  label('copyLiterals');
  emit('1865088508e00c00'); // Original output-count update / CPX #12.
  branch(0x90, 'literalFallback');
  emit('5ada8a3a186524');
  branch(0xb0, 'literalRestore');
  emit('98186520');
  branch(0xb0, 'literalRestore');
  emit('488a3a186301');
  branch(0xb0, 'literalDropSource');
  emit('a52238e90900c91700'); // The packed graphic banks are $09 through $1F.
  branch(0xb0, 'literalDropSource');
  emit('0aaaa526c97e00');
  branch(0xf0, 'literalDispatch');
  emit('c97f00');
  branch(0xd0, 'literalDropSource');
  emit('8a18692e00aa');
  label('literalDispatch');
  emit('8bf4');
  addressWord('literalsCopied', -1);
  emit('bf');
  addressWord('literalStubs');
  emit('9c48a306aaa424a3083a60'); // Push stub - 1 / X = source, Y = destination.
  label('literalsCopied');
  emit('ab84246868186301a868a200005ca39c00');
  label('literalDropSource');
  emit('68');
  label('literalRestore');
  emit('fa7a');
  label('literalFallback');
  emit('5c039d00');

  const stubs = [];
  for (const destination of [0x7e, 0x7f]) {
    for (let source = 0x09; source <= 0x1f; source += 1) {
      stubs.push((codeAddress + code.length - 1) & 0xffff);
      code.push(0x54, destination, source, 0x60); // MVN / RTS.
    }
  }
  label('literalStubs');
  for (const address of stubs) code.push(address & 0xff, address >> 8);

  // The object list stores the record type and index in the same word.
  // During a cached pass, use the record size to find its link directly.
  // $48-$4C can be reused here because the projectile pass initializes them.
  label('nextObject');
  emit('a534');
  branch(0xf0, 'nextObjectOriginal');
  emit('a5f5eb293c00a84aaaa5f529ff03');
  emit('fc'); // JSR (table,X)
  addressWord('recordSizeTable');
  emit('1879ea9f8548b9ec9f690000854aaaa7486b');
  label('nextObjectOriginal');
  emit('5c52c701');

  label('recordSize16');
  emit('0a');
  label('recordSize8');
  emit('0a');
  label('recordSize4');
  emit('0a0a60');
  label('recordSize6');
  emit('854c0a18654c0a60');
  label('recordSize0');
  emit('a9000060');
  label('recordSizeTable');
  for (const size of rom.subarray(0x00e6c5, 0x00e6d5)) {
    addressWord('recordSize' + size);
  }

  // The floor placement table supplies one horizontal and one vertical
  // index. Both look up a signed offset in the selected distance row.
  label('placeFloorObject');
  emit('a5ac0aaabfaf91034829ff000a48a5aa0a0a0a0a85ee');
  emit('681865eeaabf09ed031865e685e6');
  emit('68eb29ff000a1865eeaabf09ed03e2201865b785b7c2205cccd503');

  label('emptyHeads');
  emit('00'.repeat(178));

  // For byte-sized dimensions, a*b = floor((a+b)^2/4) - floor((a-b)^2/4).
  // Larger dimensions take the original unsigned multiply. The signed
  // callers selected below mask the other operand to a byte and use #20.
  label('multiplySmall');
  emit('c90001');
  branch(0xb0, 'multiplyOriginal');
  emit('a8a304c90001');
  branch(0xb0, 'restoreMultiplier');
  emit('981863040aaabf');
  addressWord('quarterSquares');
  emit('9c489838e306'); // Save the sum's square and find the absolute difference.
  branch(0xb0, 'squareDifference');
  emit('49ffff1a');
  label('squareDifference');
  emit('0aaa6838ff');
  addressWord('quarterSquares');
  emit('9c8304a200009b6b'); // Result in the caller's stack, X and Y clear.
  label('restoreMultiplier');
  emit('98');
  label('multiplyOriginal');
  emit('185cef9f00');

  label('quarterSquares');
  for (let value = 0; value <= 510; value += 1) {
    const square = (value * value) >> 2;
    code.push(square & 0xff, square >> 8);
  }

  for (const { offset, name, relative, adjustment = 0 } of references) {
    const target = labels.get(name);
    if (target === undefined) throw new Error(`Missing label: ${name}`);
    if (relative) {
      const distance = target - offset - 1;
      if (distance < -128 || distance > 127) throw new Error(`Branch out of range: ${name}`);
      code[offset] = distance & 0xff;
    } else {
      const address = (codeAddress + target + adjustment) & 0xffff;
      code[offset] = address & 0xff;
      code[offset + 1] = address >> 8;
    }
  }

  replace(rom, 0x1ce200, '00'.repeat(code.length), Buffer.from(code));
  replace(rom, 0x03d0c7, '64a464a6', '5c' + longAddress('initCell'));
  replace(rom, 0x03d197, '85ac645a', '5c' + longAddress('beginCell'));
  replace(rom, 0x03d81e, 'a5e8c90400', '5c' + longAddress('endCell') + 'ea');
  replace(rom, 0x03e67e, '9c90c3a540', '5c' + longAddress('finishTile') + 'ea');
  replace(rom, 0x03d360, 'd4e622c49001', '5c' + longAddress('unscaled') + 'eaea');
  replace(rom, 0x03d4a7, 'd4e622c49001', '5c' + longAddress('scaled') + 'eaea');
  replace(rom, 0x03d507, 'a7ce29ff00', '5c' + longAddress('storeBitmap') + 'ea');
  replace(rom, 0x03d802, '22558101', '22' + longAddress('releaseBitmap'));
  replace(rom, 0x0487fb, 'a5d845d6', '5c' + longAddress('selectBlit'));
  replace(rom, 0x009cfe, '1865088508', '5c' + longAddress('copyLiterals') + 'ea');
  replace(rom, 0x03d80f, '2252c701', '22' + longAddress('nextObject'));
  replace(rom, 0x03d520, 'a5ac0aa20000', '5c' + longAddress('placeFloorObject') + 'eaea');
  for (const address of [0x03d21b, 0x03d242, 0x03d2a1, 0x03d2b8, 0x03d3f1, 0x03d413]) {
    replace(rom, address, '22ef9f00', '22' + longAddress('multiplySmall'));
  }

  // The item type and quadrant are packed into the high byte of the ID.
  // Extract them directly in the loop instead of calling the variable shifter.
  replace(rom, 0x03d19b, 'a90a0048a5f529003c1822e09d0068',
    'a5f5eb4a4a290f00' + 'ea'.repeat(7));
  replace(rom, 0x03d1f8, 'a90e0048a5f51822e09d00a5c2fa86eac5ea',
    'a5f5eb' + '4a'.repeat(6) + '290300c5c2' + 'ea'.repeat(4));
}
