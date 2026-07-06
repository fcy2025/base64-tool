/**
 * 测试新的位级回放编解码器
 * 验证：解码 → 重新编码 → 与原始数据一致
 */
const fs = require('fs');
const path = require('path');

// 导入编译后的模块（通过ts-node或直接复制函数）
const {
  TT_BASE64_TABLE,
  BitReader,
  BitWriter,
  base64ToSixBitValues,
  sixBitValuesToBase64,
  base64ToBytes,
  bytesToBase64,
  encodeAccountName,
  decodeAccountName,
  calculateChecksum,
  decodeReplay,
  encodeReplay,
  extractPlayerInfo,
  extractVersion,
} = require('./src/utils/replayCodec.ts');

// 由于直接require .ts文件不行，我们用内联方式测试
// 先用node直接测试base64编解码

const TABLE = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

function base64ToBytesNode(input) {
  let cleaned = input.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (cleaned.startsWith('https://')) {
    const match = cleaned.match(/replay=([^&]+)/);
    if (match) {
      cleaned = decodeURIComponent(match[1]).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    }
  }

  const decodeTable = new Array(128).fill(-1);
  for (let i = 0; i < TABLE.length; i++) {
    decodeTable[TABLE.charCodeAt(i)] = i;
  }

  const values = [];
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code < 128 && decodeTable[code] >= 0) {
      values.push(decodeTable[code]);
    }
  }

  // 6位值转字节 - TT源码(xH函数)：缓冲区大小 = ceil(6*chars/8) 字节（向上取整）
  const bytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const v of values) {
    bitBuffer = (bitBuffer << 6) | v;
    bitCount += 6;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bitBuffer >> bitCount) & 0xFF);
    }
  }
  // TT源码: 如果有剩余位，追加一个字节（用0填充低位）
  if (bitCount > 0) {
    bytes.push((bitBuffer << (8 - bitCount)) & 0xFF);
  }
  return bytes;
}

function bytesToBase64Node(bytes) {
  const values = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const b of bytes) {
    bitBuffer = (bitBuffer << 8) | b;
    bitCount += 8;
    while (bitCount >= 6) {
      bitCount -= 6;
      values.push((bitBuffer >> bitCount) & 0x3F);
    }
  }
  if (bitCount > 0) {
    values.push((bitBuffer << (6 - bitCount)) & 0x3F);
  }
  // 不裁剪尾部'-'字符：base64字符数 = ceil(N*8/6)，由位级转换自动确定
  return values.map(v => TABLE[v]).join('');
}

// BitReader (MSB first)
class BitReaderN {
  constructor(data) {
    this.data = new Uint8Array(data);
    this.bytePos = 0;
    this.bitPos = 7;
  }
  read(size) {
    if (size <= 0) return 0;
    let result = 0;
    for (let i = 0; i < size; i++) {
      if (this.bytePos >= this.data.length) {
        throw new Error(`BitReader overflow: bytePos=${this.bytePos}, len=${this.data.length}`);
      }
      const bit = (this.data[this.bytePos] >> this.bitPos) & 1;
      result = (result << 1) | bit;
      this.bitPos--;
      if (this.bitPos < 0) {
        this.bitPos = 7;
        this.bytePos++;
      }
    }
    return result;
  }
  get bitOffset() { return this.bytePos * 8 + (7 - this.bitPos); }
  get remainingBits() { return this.data.length * 8 - this.bitOffset; }
  get size() { return this.data.length; }

  readArray(lenBits, elemBits, minLen = 0) {
    const count = this.read(lenBits);
    if (count === 0) return null;
    const actualLen = Math.max(count, minLen);
    const arr = new Array(actualLen);
    for (let i = 0; i < count; i++) arr[i] = this.read(elemBits);
    if (count > 0 && count < actualLen) {
      const last = arr[count - 1];
      for (let i = count; i < actualLen; i++) arr[i] = last;
    }
    return arr;
  }
  readString(lenBits) {
    const len = this.read(lenBits);
    let result = '';
    for (let i = 0; i < len; i++) {
      result += String.fromCharCode(this.read(16));
    }
    return result;
  }
  readStringArray(lenBits, strLenBits) {
    const count = this.read(lenBits);
    if (count === 0) return null;
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(this.readString(strLenBits));
    return arr;
  }
}

class BitWriterN {
  constructor() {
    this.data = [0];
    this.bytePos = 0;
    this.bitPos = 7;
  }
  write(size, value) {
    if (size <= 0) return;
    for (let i = size - 1; i >= 0; i--) {
      const bit = (value >> i) & 1;
      if (bit) this.data[this.bytePos] |= (1 << this.bitPos);
      this.bitPos--;
      if (this.bitPos < 0) {
        this.bitPos = 7;
        this.bytePos++;
        if (this.bytePos >= this.data.length) this.data.push(0);
      }
    }
  }
  get bitOffset() { return this.bytePos * 8 + (7 - this.bitPos); }
  setBitOffset(offset) {
    this.bytePos = Math.floor(offset / 8);
    this.bitPos = 7 - (offset % 8);
    while (this.data.length <= this.bytePos) this.data.push(0);
  }
  getBytes() { return [...this.data]; }
  get size() { return this.data.length; }

  writeArray(arr, lenBits, elemBits) {
    if (!arr || arr.length === 0) { this.write(lenBits, 0); return; }
    this.write(lenBits, arr.length);
    for (const e of arr) this.write(elemBits, e);
  }
  writeString(str, lenBits) {
    this.write(lenBits, str.length);
    for (let i = 0; i < str.length; i++) this.write(16, str.charCodeAt(i));
  }
  writeStringArray(arr, lenBits, strLenBits) {
    if (!arr || arr.length === 0) { this.write(lenBits, 0); return; }
    this.write(lenBits, arr.length);
    for (const s of arr) this.writeString(s, strLenBits);
  }
}

function encodeAccountNameN(name, size = 5) {
  let cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (cleaned.length > size) cleaned = cleaned.substring(0, size);
  else while (cleaned.length < size) cleaned = '-' + cleaned;

  const decodeTable = new Array(128).fill(-1);
  for (let i = 0; i < TABLE.length; i++) decodeTable[TABLE.charCodeAt(i)] = i;

  const values = [];
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    values.push(code < 128 ? decodeTable[code] : 0);
  }

  let result = 0, mult = 1;
  for (let i = values.length - 1; i >= 0; i--) {
    result += mult * values[i];
    mult *= 64;
  }
  return result;
}

function decodeAccountNameN(hash, size = 5) {
  let result = '';
  for (let i = 0; i < size; i++) {
    const shift = (size - 1 - i) * 6;
    result += TABLE[(hash >> shift) & 0x3F];
  }
  return result;
}

function calcChecksumN(bytes, version) {
  let cs = version;
  for (let i = 3; i < bytes.length; i++) cs = (cs + bytes[i]) & 4095;
  return cs;
}

function readEventN(reader) {
  const id = reader.read(4);
  const fs = reader.read(9);
  let fu = 0, fw = 0;
  switch (id) {
    case 0: fu = reader.read(22); break;
    case 1: fu = reader.read(10); fw = reader.read(10); break;
    case 2: fu = reader.read(10); fw = reader.read(9); break;
    case 3: fu = reader.read(10); fw = reader.read(27); break;
    case 4: fu = reader.read(10); fw = reader.read(16); break;
    case 5: fu = reader.read(10); break;
    case 6: fu = reader.read(10); break;
    case 7: fu = reader.read(1); break;
    case 10: fu = reader.read(20); fw = reader.read(22); break;
  }
  return { id, fs, fu, fw };
}

function writeEventN(writer, event) {
  writer.write(4, event.id);
  writer.write(9, event.fs);
  switch (event.id) {
    case 0: writer.write(22, event.fu); break;
    case 1: writer.write(10, event.fu); writer.write(10, event.fw); break;
    case 2: writer.write(10, event.fu); writer.write(9, event.fw); break;
    case 3: writer.write(10, event.fu); writer.write(27, event.fw); break;
    case 4: writer.write(10, event.fu); writer.write(16, event.fw); break;
    case 5: writer.write(10, event.fu); break;
    case 6: writer.write(10, event.fu); break;
    case 7: writer.write(1, event.fu); break;
    case 10: writer.write(20, event.fu); writer.write(22, event.fw); break;
  }
}

function decodeReplayN(bytesInput) {
  // 先读取 byteCount 以确定是否需要填充
  let bytes = bytesInput;
  const probe = new BitReaderN(bytes);
  const version = probe.read(12);
  const checksum = probe.read(12);
  const byteCount = probe.read(31);

  // base64 解码可能少 1-2 字节，填充到 byteCount
  if (bytes.length < byteCount) {
    bytes = [...bytes, ...new Array(byteCount - bytes.length).fill(0)];
  }

  const reader = new BitReaderN(bytes);
  reader.read(12); // version
  reader.read(12); // checksum
  reader.read(31); // byteCount

  const settings = {};
  settings.mapType = reader.read(2);
  settings.mapProceduralIndex = reader.read(8);
  settings.mapRealisticIndex = reader.read(8);
  settings.mapSeed = reader.read(14);
  settings.mapName = reader.readString(5);

  if (settings.mapType === 2) {
    return { error: 'Image map not supported', version, checksum, byteCount };
  }

  settings.passableWater = reader.read(1);
  settings.passableMountains = reader.read(1);
  settings.playerCount = reader.read(10);
  settings.humanCount = reader.read(10);
  settings.selectedPlayer = reader.read(9);
  settings.gameMode = reader.read(1);
  settings.playerMode = reader.read(2);
  settings.battleRoyaleMode = reader.read(2);
  settings.numberTeams = reader.read(4);
  settings.isZombieMode = reader.read(1);
  settings.isContest = reader.read(1);
  settings.isReplay = reader.read(1);
  settings.elo = reader.readArray(2, 14, 0);
  settings.colorsType = reader.read(1);
  settings.colorsPersonalized = reader.read(1);
  settings.colorsData = reader.readArray(10, 18, 0);
  settings.selectableColor = reader.read(1);
  settings.teamPlayerCount = reader.readArray(4, 10, 0);
  settings.neutralBots = reader.read(1);
  settings.botDifficultyType = reader.read(2);
  settings.botDifficultyValue = reader.read(4);
  settings.botDifficultyTeam = reader.readArray(4, 4, 0);
  settings.botDifficultyData = reader.readArray(10, 4, 0);
  settings.spawningType = reader.read(2);
  settings.spawningSeed = reader.read(14);
  settings.spawningData = reader.readArray(11, 12, 0);
  settings.selectableSpawn = reader.read(1);
  settings.playerNamesType = reader.read(2);
  settings.playerNamesData = reader.readStringArray(10, 5);
  settings.selectableName = reader.read(1);
  settings.aIncomeType = reader.read(2);
  settings.aIncomeValue = reader.read(8);
  settings.aIncomeData = reader.readArray(10, 8, 0);
  settings.tIncomeType = reader.read(2);
  settings.tIncomeValue = reader.read(8);
  settings.tIncomeData = reader.readArray(10, 8, 0);
  settings.iIncomeType = reader.read(2);
  settings.iIncomeValue = reader.read(8);
  settings.iIncomeData = reader.readArray(10, 8, 0);
  settings.sResourcesType = reader.read(2);
  settings.sResourcesValue = reader.read(11);
  settings.sResourcesData = reader.readArray(10, 11, 0);
  // a61（账户名哈希数组）仅在 v16+ 存在；v15 及之前不读取此字段
  settings.a61 = version >= 16 ? reader.readArray(10, 30, 0) : null;

  const xQ = reader.read(5);
  const eventCount = reader.read(30);
  const frameMarkerCount = reader.read(30);

  const events = [];
  for (let i = 0; i < eventCount; i++) events.push(readEventN(reader));

  const frameMarkers = [];
  for (let i = 0; i < frameMarkerCount; i++) {
    frameMarkers.push({ isFrameStart: reader.read(1), frameLength: reader.read(xQ) });
  }

  return { version, checksum, byteCount, settings, xQ, events, frameMarkers, bitOffset: reader.bitOffset, totalBits: reader.size * 8 };
}

function encodeReplayN(replay) {
  const writer = new BitWriterN();
  writer.write(12, replay.version);
  writer.write(12, 0); // checksum placeholder
  writer.write(31, 0); // byteCount placeholder

  const s = replay.settings;
  writer.write(2, s.mapType);
  writer.write(8, s.mapProceduralIndex);
  writer.write(8, s.mapRealisticIndex);
  writer.write(14, s.mapSeed);
  writer.writeString(s.mapName, 5);
  writer.write(1, s.passableWater);
  writer.write(1, s.passableMountains);
  writer.write(10, s.playerCount);
  writer.write(10, s.humanCount);
  writer.write(9, s.selectedPlayer);
  writer.write(1, s.gameMode);
  writer.write(2, s.playerMode);
  writer.write(2, s.battleRoyaleMode);
  writer.write(4, s.numberTeams);
  writer.write(1, s.isZombieMode);
  writer.write(1, s.isContest);
  writer.write(1, s.isReplay);
  writer.writeArray(s.elo, 2, 14);
  writer.write(1, s.colorsType);
  writer.write(1, s.colorsPersonalized);
  writer.writeArray(s.colorsData, 10, 18);
  writer.write(1, s.selectableColor);
  writer.writeArray(s.teamPlayerCount, 4, 10);
  writer.write(1, s.neutralBots);
  writer.write(2, s.botDifficultyType);
  writer.write(4, s.botDifficultyValue);
  writer.writeArray(s.botDifficultyTeam, 4, 4);
  writer.writeArray(s.botDifficultyData, 10, 4);
  writer.write(2, s.spawningType);
  writer.write(14, s.spawningSeed);
  writer.writeArray(s.spawningData, 11, 12);
  writer.write(1, s.selectableSpawn);
  writer.write(2, s.playerNamesType);
  writer.writeStringArray(s.playerNamesData, 10, 5);
  writer.write(1, s.selectableName);
  writer.write(2, s.aIncomeType);
  writer.write(8, s.aIncomeValue);
  writer.writeArray(s.aIncomeData, 10, 8);
  writer.write(2, s.tIncomeType);
  writer.write(8, s.tIncomeValue);
  writer.writeArray(s.tIncomeData, 10, 8);
  writer.write(2, s.iIncomeType);
  writer.write(8, s.iIncomeValue);
  writer.writeArray(s.iIncomeData, 10, 8);
  writer.write(2, s.sResourcesType);
  writer.write(11, s.sResourcesValue);
  writer.writeArray(s.sResourcesData, 10, 11);
  // a61（账户名哈希数组）仅在 v16+ 存在；v15 及之前不写入此字段
  if (replay.version >= 16) {
    writer.writeArray(s.a61, 10, 30);
  }

  writer.write(5, replay.xQ);
  writer.write(30, replay.events.length);
  writer.write(30, replay.frameMarkers.length);
  for (const e of replay.events) writeEventN(writer, e);
  for (const m of replay.frameMarkers) {
    writer.write(1, m.isFrameStart);
    writer.write(replay.xQ, m.frameLength);
  }

  // TT源码 aWl.a0a 的对齐和byteCount逻辑
  const dataBits = writer.bitOffset;
  const N = Math.ceil(dataBits / 8);           // data_bytes
  const a0N = Math.ceil(dataBits / 6);         // base64字符数
  const requiredBytes = Math.ceil(6 * a0N / 8); // base64编码所需字节数

  // 如果 requiredBytes !== N，push 1个0对齐字节
  let byteCount = N;
  if (requiredBytes !== N) {
    byteCount = N + 1;
  }

  // 写入 byteCount 到头部（bit 24-54）
  writer.setBitOffset(24);
  writer.write(31, byteCount);

  // 获取字节数组用于计算校验和（需要包含对齐字节以保证长度正确）
  let bytesForChecksum = writer.getBytes();
  while (bytesForChecksum.length < byteCount) {
    bytesForChecksum.push(0);
  }

  // 计算并写入校验和（bit 12-23）
  const checksum = calcChecksumN(bytesForChecksum, replay.version);
  writer.setBitOffset(12);
  writer.write(12, checksum);

  // 获取最终字节数组，pad到requiredBytes（用于base64编码读取6*a0N位）
  let result = writer.getBytes();
  while (result.length < requiredBytes) {
    result.push(0);
  }

  // 保存元信息用于base64编码
  encodeReplayN.lastResult = { bytes: result, byteCount, dataBits, a0N };
  return result;
}

/** TT源码 tP函数：从字节数组读取 a0N 个6位值（共 6*a0N 位） */
function encodeReplayToBase64N(replay) {
  encodeReplayN(replay);
  const { bytes, a0N } = encodeReplayN.lastResult;
  const reader = new BitReaderN(bytes);
  let result = '';
  for (let i = 0; i < a0N; i++) {
    result += TABLE[reader.read(6)];
  }
  return result;
}

// === 测试 ===
console.log('=== TT Playback 位级解析器测试 ===\n');

// 测试账户名编解码
console.log('--- 账户名编解码测试 ---');
const testAccounts = ['88M5T', 'NQ7d7', 'vm5Mb', '_xeXm', 'KWN7u'];
for (const acc of testAccounts) {
  const hash = encodeAccountNameN(acc);
  const decoded = decodeAccountNameN(hash);
  console.log(`  ${acc} → hash=${hash} → ${decoded} ${acc === decoded ? '✓' : '✗'}`);
}

// 测试所有rp文件
console.log('\n--- rp文件解析测试 ---');
const rpDir = path.join(__dirname, 'rp');
const files = fs.readdirSync(rpDir).filter(f => f.match(/^\d+\.txt$/)).sort((a, b) => {
  return parseInt(a) - parseInt(b);
});

for (const file of files) {
  const input = fs.readFileSync(path.join(rpDir, file), 'utf8').trim();
  console.log(`\n=== ${file} ===`);

  const version = TABLE.indexOf(input[1]);
  console.log(`  版本码: ${input.substring(0, 2)}, 版本号: ${version}`);
  console.log(`  原始长度: ${input.length} 字符`);

  // 跳过不支持的版本（仅支持 v16, v17, v22）
  if (version > 22) {
    console.log(`  跳过: 版本 ${version} 暂不支持（仅支持 v≤22）`);
    continue;
  }

  try {
    const bytes = base64ToBytesNode(input);
    console.log(`  解码字节: ${bytes.length}`);

    const replay = decodeReplayN(bytes);
    console.log(`  解析成功! version=${replay.version}, checksum=${replay.checksum}, byteCount=${replay.byteCount}`);
    console.log(`  玩家数: ${replay.settings.playerCount}, 人类数: ${replay.settings.humanCount}`);
    console.log(`  地图名: "${replay.settings.mapName}"`);
    console.log(`  playerNamesType: ${replay.settings.playerNamesType}`);
    console.log(`  事件数: ${replay.events.length}, 帧标记数: ${replay.frameMarkers.length}`);
    console.log(`  动态位宽xQ: ${replay.xQ}`);
    console.log(`  已用位数: ${replay.bitOffset} / 总位数: ${replay.totalBits}`);

    // 显示昵称
    if (replay.settings.playerNamesData) {
      console.log(`  昵称数组 (${replay.settings.playerNamesData.length}个):`);
      for (let i = 0; i < replay.settings.playerNamesData.length; i++) {
        console.log(`    [${i}] "${replay.settings.playerNamesData[i]}"`);
      }
    } else {
      console.log(`  无昵称数据`);
    }

    // 显示账户名哈希
    if (replay.settings.a61) {
      console.log(`  账户名哈希数组 (${replay.settings.a61.length}个):`);
      for (let i = 0; i < Math.min(replay.settings.a61.length, 20); i++) {
        const decoded = decodeAccountNameN(replay.settings.a61[i]);
        console.log(`    [${i}] hash=${replay.settings.a61[i]} → "${decoded}"`);
      }
      if (replay.settings.a61.length > 20) {
        console.log(`    ... 还有 ${replay.settings.a61.length - 20} 个`);
      }
    }

    // 往返编码测试（使用 encodeReplayToBase64N 只编码 a0N*6 位）
    const reencodedBase64 = encodeReplayToBase64N(replay);
    const roundtrip = reencodedBase64 === input;
    console.log(`  往返编码: ${roundtrip ? '✓ 一致' : '✗ 不一致'}`);
    if (!roundtrip) {
      console.log(`    原始: ${input.substring(0, 80)}...`);
      console.log(`    重编: ${reencodedBase64.substring(0, 80)}...`);
      console.log(`    原始长度: ${input.length}, 重编长度: ${reencodedBase64.length}`);

      // 检查校验和
      const reencoded = encodeReplayN.lastResult.bytes;
      const newChecksum = calcChecksumN(reencoded, replay.version);
      console.log(`    校验和: 原始=${replay.checksum}, 新=${newChecksum}`);
      console.log(`    dataBits=${encodeReplayN.lastResult.dataBits}, a0N=${encodeReplayN.lastResult.a0N}, byteCount=${encodeReplayN.lastResult.byteCount}`);
    }
  } catch (e) {
    console.log(`  解析失败: ${e.message}`);
    console.log(`  堆栈: ${e.stack}`);
  }
}
