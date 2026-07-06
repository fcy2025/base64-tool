/**
 * TT Playback Replay Codec
 *
 * 基于 territorial.io 版本22源代码分析实现的位级回放编解码器。
 *
 * 回放文件结构（位级打包，MSB优先）：
 *   头部: [version:12位][checksum:12位][byteCount:31位]
 *   游戏设置: mapType, mapSeed, playerCount, playerNamesData(昵称), a61(账户名哈希) 等
 *   事件数组: [xQ:5位][事件数:30位][帧标记数:30位] + 每事件按id查表确定位宽
 *   帧标记数组: 每标记 [isFrameStart:1位][frameLength:xQ位]
 *
 * Base64字母表: -0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz
 *   （标准base64变体，用'-'替换'+'，'_'替换'/'，无'='填充）
 *
 * 账户名"哈希"实为base64多项式求值（5字符×6位=30位整数），可逆。
 * 昵称以UTF-16存储（5位长度前缀 + 每字符16位）。
 * 校验和: (version + Σbytes[3..end]) mod 4096
 */

// ============================================================
// 常量定义
// ============================================================

/** TT Playback 自定义 Base64 字母表 */
export const TT_BASE64_TABLE = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/** 版本号到字母表的映射（版本号 = TABLE.indexOf(code[1])） */
export const VERSION_TABLE = TT_BASE64_TABLE;

// ============================================================
// BitReader — MSB优先位读取器
// ============================================================

export class BitReader {
  private data: Uint8Array;
  private bytePos: number = 0;
  private bitPos: number = 7; // MSB first: bit 7 is first

  constructor(data: Uint8Array | number[]) {
    this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  /** 读取 size 位无符号整数（MSB优先） */
  read(size: number): number {
    if (size <= 0) return 0;
    let result = 0;
    for (let i = 0; i < size; i++) {
      if (this.bytePos >= this.data.length) {
        throw new Error(`BitReader overflow: bytePos=${this.bytePos}, data.length=${this.data.length}`);
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

  /** 当前位偏移 */
  get bitOffset(): number {
    return this.bytePos * 8 + (7 - this.bitPos);
  }

  /** 设置位偏移 */
  setBitOffset(offset: number): void {
    this.bytePos = Math.floor(offset / 8);
    this.bitPos = 7 - (offset % 8);
  }

  /** 剩余位数 */
  get remainingBits(): number {
    return this.data.length * 8 - this.bitOffset;
  }

  /** 数据总字节数 */
  get size(): number {
    return this.data.length;
  }

  /** 读取变长数组（对应源码 aX8 函数）
   * @param lenBits 长度字段位数
   * @param elemBits 每元素位数
   * @param minLen 最小长度（不足用最后一个非零值填充）
   */
  readArray(lenBits: number, elemBits: number, minLen: number = 0): number[] | null {
    const count = this.read(lenBits);
    if (count === 0) return null;
    const actualLen = Math.max(count, minLen);
    const arr: number[] = new Array(actualLen);
    for (let i = 0; i < count; i++) {
      arr[i] = this.read(elemBits);
    }
    // 用最后一个值填充剩余位置
    if (count > 0 && count < actualLen) {
      const lastVal = arr[count - 1];
      for (let i = count; i < actualLen; i++) {
        arr[i] = lastVal;
      }
    }
    return arr;
  }

  /** 读取字符串（对应源码 aXO 函数）
   * @param lenBits 长度字段位数
   * @returns UTF-16字符串
   */
  readString(lenBits: number): string {
    const len = this.read(lenBits);
    let result = '';
    for (let i = 0; i < len; i++) {
      const code = this.read(16);
      result += String.fromCharCode(code);
    }
    return result;
  }

  /** 读取字符串数组（对应源码 aXQ 函数）
   * @param lenBits 数组长度的位数
   * @param strLenBits 每个字符串长度的位数
   */
  readStringArray(lenBits: number, strLenBits: number): string[] | null {
    const count = this.read(lenBits);
    if (count === 0) return null;
    const arr: string[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(this.readString(strLenBits));
    }
    return arr;
  }
}

// ============================================================
// BitWriter — MSB优先位写入器
// ============================================================

export class BitWriter {
  private data: number[] = [];
  private bytePos: number = 0;
  private bitPos: number = 7; // MSB first

  constructor() {
    this.data.push(0);
  }

  /** 写入 size 位无符号整数（MSB优先） */
  write(size: number, value: number): void {
    if (size <= 0) return;
    for (let i = size - 1; i >= 0; i--) {
      const bit = (value >> i) & 1;
      if (bit) {
        this.data[this.bytePos] |= (1 << this.bitPos);
      }
      this.bitPos--;
      if (this.bitPos < 0) {
        this.bitPos = 7;
        this.bytePos++;
        if (this.bytePos >= this.data.length) {
          this.data.push(0);
        }
      }
    }
  }

  /** 当前位偏移 */
  get bitOffset(): number {
    return this.bytePos * 8 + (7 - this.bitPos);
  }

  /** 设置位偏移 */
  setBitOffset(offset: number): void {
    this.bytePos = Math.floor(offset / 8);
    this.bitPos = 7 - (offset % 8);
    while (this.data.length <= this.bytePos) {
      this.data.push(0);
    }
  }

  /** 获取字节数组 */
  getBytes(): number[] {
    return [...this.data];
  }

  /** 数据总字节数 */
  get size(): number {
    return this.data.length;
  }

  /** 写入变长数组（对应源码 dp 函数） */
  writeArray(arr: number[] | null, lenBits: number, elemBits: number): void {
    if (!arr || arr.length === 0) {
      this.write(lenBits, 0);
      return;
    }
    this.write(lenBits, arr.length);
    for (const elem of arr) {
      this.write(elemBits, elem);
    }
  }

  /** 写入字符串（对应源码 aXO 函数） */
  writeString(str: string, lenBits: number): void {
    this.write(lenBits, str.length);
    for (let i = 0; i < str.length; i++) {
      this.write(16, str.charCodeAt(i));
    }
  }

  /** 写入字符串数组（对应源码 aXQ 函数） */
  writeStringArray(arr: string[] | null, lenBits: number, strLenBits: number): void {
    if (!arr || arr.length === 0) {
      this.write(lenBits, 0);
      return;
    }
    this.write(lenBits, arr.length);
    for (const s of arr) {
      this.writeString(s, strLenBits);
    }
  }
}

// ============================================================
// Base64 编解码（自定义字母表）
// ============================================================

/** Base64 反向查找表（charCode → 6位值） */
const BASE64_DECODE_TABLE: number[] = new Array(128).fill(-1);
for (let i = 0; i < TT_BASE64_TABLE.length; i++) {
  BASE64_DECODE_TABLE[TT_BASE64_TABLE.charCodeAt(i)] = i;
}

/** 将base64字符串解码为6位值数组 */
export function base64ToSixBitValues(input: string): number[] {
  // 清洗：trim + 非[a-zA-Z0-9_-]替换为'-'
  let cleaned = input.trim().replace(/[^a-zA-Z0-9_-]/g, '-');

  // 处理URL前缀
  if (cleaned.startsWith('https://')) {
    const match = cleaned.match(/replay=([^&]+)/);
    if (match) {
      cleaned = decodeURIComponent(match[1]).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    }
  }

  const result: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code < 128 && BASE64_DECODE_TABLE[code] >= 0) {
      result.push(BASE64_DECODE_TABLE[code]);
    }
  }
  return result;
}

/** 将6位值数组编码为base64字符串 */
export function sixBitValuesToBase64(values: number[]): string {
  let result = '';
  for (const v of values) {
    result += TT_BASE64_TABLE[v & 0x3F];
  }
  return result;
}

/** 将base64字符串解码为6位值数组，然后转为字节数组
 * TT源码(xH函数)：缓冲区大小 = ceil(6*chars/8) 字节（向上取整）
 * 最后一个字节可能包含填充位（值为0）
 */
export function base64ToBytes(input: string): number[] {
  const values = base64ToSixBitValues(input);
  const bytes: number[] = [];
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
  // TT源码: 缓冲区大小 = ceil(6*values.length/8) 字节
  // 如果有剩余位，追加一个字节（用0填充低位）
  if (bitCount > 0) {
    bytes.push((bitBuffer << (8 - bitCount)) & 0xFF);
  }
  return bytes;
}

/** 将字节数组编码为base64字符串 */
export function bytesToBase64(bytes: number[]): string {
  const values: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (const b of bytes) {
    bitBuffer = (bitBuffer << 8) | (b & 0xFF);
    bitCount += 8;
    while (bitCount >= 6) {
      bitCount -= 6;
      values.push((bitBuffer >> bitCount) & 0x3F);
    }
  }
  // 处理剩余不足6位的情况（用0填充）
  if (bitCount > 0) {
    values.push((bitBuffer << (6 - bitCount)) & 0x3F);
  }
  return sixBitValuesToBase64(values);
}

// ============================================================
// 账户名编解码（xM / a0P 函数实现）
// ============================================================

/**
 * 账户名编码：将5字符base64字符串转为30位整数
 * 对应源码 bJ.tN.xM(name, 5)
 *
 * 算法：
 *   1. 清洗：非[a-zA-Z0-9_-]替换为'-'
 *   2. 定长填充：截断到5字符，不足左补'-'
 *   3. 每字符转6位值
 *   4. 多项式求值：value = h[4]*64^0 + h[3]*64^1 + ... + h[0]*64^4
 */
export function encodeAccountName(name: string, size: number = 5): number {
  // 清洗
  let cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  // 定长填充：截断或左补'-'
  if (cleaned.length > size) {
    cleaned = cleaned.substring(0, size);
  } else {
    while (cleaned.length < size) {
      cleaned = '-' + cleaned;
    }
  }

  // 转为6位值数组
  const values: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    values.push(code < 128 ? BASE64_DECODE_TABLE[code] : 0);
  }

  // 多项式求值（小端序：最后一个字符是最低位）
  let result = 0;
  let multiplier = 1;
  for (let i = values.length - 1; i >= 0; i--) {
    result += multiplier * values[i];
    multiplier *= 64;
  }
  return result;
}

/**
 * 账户名解码：将30位整数转为5字符base64字符串
 * 对应源码 bI.tN.a0P(value, 5)
 */
export function decodeAccountName(hash: number, size: number = 5): string {
  let result = '';
  for (let i = 0; i < size; i++) {
    const shift = (size - 1 - i) * 6;
    const value = (hash >> shift) & 0x3F;
    result += TT_BASE64_TABLE[value];
  }
  return result;
}

// ============================================================
// 校验和计算
// ============================================================

/**
 * 计算12位校验和
 * 对应源码 aXR 函数
 *
 * 算法：(version + Σbytes[3..end]) mod 4096
 */
export function calculateChecksum(bytes: number[], version: number): number {
  let checksum = version;
  for (let i = 3; i < bytes.length; i++) {
    checksum = (checksum + bytes[i]) & 4095;
  }
  return checksum;
}

// ============================================================
// 回放数据结构定义
// ============================================================

export interface GameSettings {
  mapType: number;
  mapProceduralIndex: number;
  mapRealisticIndex: number;
  mapSeed: number;
  mapName: string;
  passableWater: number;
  passableMountains: number;
  playerCount: number;
  humanCount: number;
  selectedPlayer: number;
  gameMode: number;
  playerMode: number;
  battleRoyaleMode: number;
  numberTeams: number;
  isZombieMode: number;
  isContest: number;
  isReplay: number;
  elo: number[] | null;
  colorsType: number;
  colorsPersonalized: number;
  colorsData: number[] | null;
  selectableColor: number;
  teamPlayerCount: number[] | null;
  neutralBots: number;
  botDifficultyType: number;
  botDifficultyValue: number;
  botDifficultyTeam: number[] | null;
  botDifficultyData: number[] | null;
  spawningType: number;
  spawningSeed: number;
  spawningData: number[] | null;
  selectableSpawn: number;
  playerNamesType: number;
  playerNamesData: string[] | null; // 昵称数组
  selectableName: number;
  aIncomeType: number;
  aIncomeValue: number;
  aIncomeData: number[] | null;
  tIncomeType: number;
  tIncomeValue: number;
  tIncomeData: number[] | null;
  iIncomeType: number;
  iIncomeValue: number;
  iIncomeData: number[] | null;
  sResourcesType: number;
  sResourcesValue: number;
  sResourcesData: number[] | null;
  a61: number[] | null; // 账户名哈希数组
}

export interface ReplayEvent {
  id: number;
  fs: number;
  fu: number;
  fw: number;
}

export interface ReplayData {
  version: number;
  checksum: number;
  byteCount: number;
  settings: GameSettings;
  xQ: number; // 动态位宽
  events: ReplayEvent[];
  frameMarkers: { isFrameStart: number; frameLength: number }[];
  rawBytes: number[]; // 原始字节数据
}

// ============================================================
// 回放解码器
// ============================================================

/**
 * 解码回放数据
 * 对应源码 aWm.xP 函数
 */
export function decodeReplay(bytesInput: number[]): ReplayData {
  // 先读取头部以获取 byteCount
  let bytes = bytesInput;
  const probeReader = new BitReader(bytes);
  const version = probeReader.read(12);
  const checksum = probeReader.read(12);
  const byteCount = probeReader.read(31);

  // 填充或截断到 byteCount（base64 解码可能少 1-2 字节，或带有多余的对齐填充字节）
  if (bytes.length < byteCount) {
    bytes = [...bytes, ...new Array(byteCount - bytes.length).fill(0)];
  }

  const reader = new BitReader(bytes);

  // === 读取头部 ===
  reader.read(12); // version（已读取）
  reader.read(12); // checksum（已读取）
  reader.read(31); // byteCount（已读取）

  // === 读取游戏设置（对应 aWz / aXJ 的逆操作）===
  const settings = readGameSettings(reader, version);

  // === 读取事件和帧标记 ===
  const xQ = reader.read(5); // 动态位宽
  const eventCount = reader.read(30);
  const frameMarkerCount = reader.read(30);

  const events: ReplayEvent[] = [];
  for (let i = 0; i < eventCount; i++) {
    events.push(readEvent(reader));
  }

  const frameMarkers: { isFrameStart: number; frameLength: number }[] = [];
  for (let i = 0; i < frameMarkerCount; i++) {
    frameMarkers.push({
      isFrameStart: reader.read(1),
      frameLength: reader.read(xQ),
    });
  }

  return {
    version,
    checksum,
    byteCount,
    settings,
    xQ,
    events,
    frameMarkers,
    rawBytes: bytes,
  };
}

/** 读取游戏设置（对应源码 aWz 函数，逆向 aXJ）
 * @param version 回放版本号（用于确定字段结构差异）
 * 注：a61（账户名哈希数组）在v16引入，v15及之前不包含此字段
 */
function readGameSettings(reader: BitReader, version: number): GameSettings {
  const settings: Partial<GameSettings> = {};

  settings.mapType = reader.read(2);
  settings.mapProceduralIndex = reader.read(8);
  settings.mapRealisticIndex = reader.read(8);
  settings.mapSeed = reader.read(14);
  settings.mapName = reader.readString(5);

  // 如果是图像地图(mapType===2)，需要跳过canvas数据
  if (settings.mapType === 2) {
    // canvas数据格式复杂，这里跳过（实际回放很少使用）
    throw new Error('Image map (mapType=2) is not supported yet');
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
  // a61（账户名哈希数组）在v16引入，v15及之前不包含此字段
  settings.a61 = version >= 16 ? reader.readArray(10, 30, 0) : null;

  return settings as GameSettings;
}

/** 读取单个事件（对应源码 aXC 函数） */
function readEvent(reader: BitReader): ReplayEvent {
  const id = reader.read(4);
  const fs = reader.read(9);
  let fu = 0;
  let fw = 0;

  switch (id) {
    case 0:
      fu = reader.read(22);
      break;
    case 1:
      fu = reader.read(10);
      fw = reader.read(10);
      break;
    case 2:
      fu = reader.read(10);
      fw = reader.read(9);
      break;
    case 3:
      fu = reader.read(10);
      fw = reader.read(27);
      break;
    case 4:
      fu = reader.read(10);
      fw = reader.read(16);
      break;
    case 5:
      fu = reader.read(10);
      break;
    case 6:
      fu = reader.read(10);
      break;
    case 7:
      fu = reader.read(1);
      break;
    case 10:
      fu = reader.read(20);
      fw = reader.read(22);
      break;
    default:
      // 未知事件类型，跳过
      break;
  }

  return { id, fs, fu, fw };
}

// ============================================================
// 回放编码器
// ============================================================

/**
 * 编码回放数据（内部实现，返回字节数组和元信息）
 * 对应源码 aWl.a0a 函数
 *
 * TT源码编码流程：
 *   1. 写入所有数据位 → dataBits 位
 *   2. N = ceil(dataBits/8) = data_bytes
 *   3. a0N = ceil(dataBits/6) = base64字符数
 *   4. requiredBytes = ceil(6*a0N/8)
 *   5. 如果 requiredBytes !== N，push 1个0对齐字节，byteCount = N+1
 *   6. 否则 byteCount = N
 *   7. 写入 byteCount 和 checksum 到头部
 *   8. base64编码：从字节数组读取 a0N 个6位值（共 6*a0N 位）
 */
interface EncodeInternalResult {
  bytes: number[];      // 字节数组（pad到requiredBytes）
  byteCount: number;    // byteCount值
  dataBits: number;     // 总数据位数
}

function encodeReplayInternal(replay: ReplayData): EncodeInternalResult {
  const writer = new BitWriter();

  // === 写入头部 ===
  writer.write(12, replay.version);
  writer.write(12, 0); // 校验和占位，稍后回写
  writer.write(31, 0); // 字节数占位，稍后回写

  // === 写入游戏设置 ===
  writeGameSettings(writer, replay.settings, replay.version);

  // === 写入事件和帧标记 ===
  writer.write(5, replay.xQ);
  writer.write(30, replay.events.length);
  writer.write(30, replay.frameMarkers.length);

  for (const event of replay.events) {
    writeEvent(writer, event);
  }

  for (const marker of replay.frameMarkers) {
    writer.write(1, marker.isFrameStart);
    writer.write(replay.xQ, marker.frameLength);
  }

  // === TT源码 aWl.a0a 的对齐和byteCount逻辑 ===
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
  // 校验和 = (version + Σbytes[3..end]) mod 4096
  // 对齐字节为0不影响累加和
  const checksum = calculateChecksum(bytesForChecksum, replay.version);
  writer.setBitOffset(12);
  writer.write(12, checksum);

  // 获取最终字节数组，pad到requiredBytes（用于base64编码读取6*a0N位）
  let result = writer.getBytes();
  while (result.length < requiredBytes) {
    result.push(0);
  }

  return { bytes: result, byteCount, dataBits };
}

/** 编码回放数据，返回字节数组 */
export function encodeReplay(replay: ReplayData): number[] {
  return encodeReplayInternal(replay).bytes;
}

/** 写入游戏设置（对应源码 aXJ 函数）
 * @param version 回放版本号（用于条件写入 a61 字段：仅 v16+ 包含账户名哈希数组）
 */
function writeGameSettings(writer: BitWriter, settings: GameSettings, version: number): void {
  writer.write(2, settings.mapType);
  writer.write(8, settings.mapProceduralIndex);
  writer.write(8, settings.mapRealisticIndex);
  writer.write(14, settings.mapSeed);
  writer.writeString(settings.mapName, 5);

  if (settings.mapType === 2) {
    throw new Error('Image map (mapType=2) is not supported yet');
  }

  writer.write(1, settings.passableWater);
  writer.write(1, settings.passableMountains);
  writer.write(10, settings.playerCount);
  writer.write(10, settings.humanCount);
  writer.write(9, settings.selectedPlayer);
  writer.write(1, settings.gameMode);
  writer.write(2, settings.playerMode);
  writer.write(2, settings.battleRoyaleMode);
  writer.write(4, settings.numberTeams);
  writer.write(1, settings.isZombieMode);
  writer.write(1, settings.isContest);
  writer.write(1, settings.isReplay);
  writer.writeArray(settings.elo, 2, 14);
  writer.write(1, settings.colorsType);
  writer.write(1, settings.colorsPersonalized);
  writer.writeArray(settings.colorsData, 10, 18);
  writer.write(1, settings.selectableColor);
  writer.writeArray(settings.teamPlayerCount, 4, 10);
  writer.write(1, settings.neutralBots);
  writer.write(2, settings.botDifficultyType);
  writer.write(4, settings.botDifficultyValue);
  writer.writeArray(settings.botDifficultyTeam, 4, 4);
  writer.writeArray(settings.botDifficultyData, 10, 4);
  writer.write(2, settings.spawningType);
  writer.write(14, settings.spawningSeed);
  writer.writeArray(settings.spawningData, 11, 12);
  writer.write(1, settings.selectableSpawn);
  writer.write(2, settings.playerNamesType);
  writer.writeStringArray(settings.playerNamesData, 10, 5);
  writer.write(1, settings.selectableName);
  writer.write(2, settings.aIncomeType);
  writer.write(8, settings.aIncomeValue);
  writer.writeArray(settings.aIncomeData, 10, 8);
  writer.write(2, settings.tIncomeType);
  writer.write(8, settings.tIncomeValue);
  writer.writeArray(settings.tIncomeData, 10, 8);
  writer.write(2, settings.iIncomeType);
  writer.write(8, settings.iIncomeValue);
  writer.writeArray(settings.iIncomeData, 10, 8);
  writer.write(2, settings.sResourcesType);
  writer.write(11, settings.sResourcesValue);
  writer.writeArray(settings.sResourcesData, 10, 11);
  // a61（账户名哈希数组）仅在 v16+ 存在；v15 及之前不写入此字段
  if (version >= 16) {
    writer.writeArray(settings.a61, 10, 30);
  }
}

/** 写入单个事件（对应源码 aXK 函数） */
function writeEvent(writer: BitWriter, event: ReplayEvent): void {
  writer.write(4, event.id);
  writer.write(9, event.fs);

  switch (event.id) {
    case 0:
      writer.write(22, event.fu);
      break;
    case 1:
      writer.write(10, event.fu);
      writer.write(10, event.fw);
      break;
    case 2:
      writer.write(10, event.fu);
      writer.write(9, event.fw);
      break;
    case 3:
      writer.write(10, event.fu);
      writer.write(27, event.fw);
      break;
    case 4:
      writer.write(10, event.fu);
      writer.write(16, event.fw);
      break;
    case 5:
      writer.write(10, event.fu);
      break;
    case 6:
      writer.write(10, event.fu);
      break;
    case 7:
      writer.write(1, event.fu);
      break;
    case 10:
      writer.write(20, event.fu);
      writer.write(22, event.fw);
      break;
    default:
      break;
  }
}

// ============================================================
// 高级API：完整的回放编解码流程
// ============================================================

/** 完整解码：base64字符串 → ReplayData */
export function decodeReplayFromBase64(base64Str: string): ReplayData {
  const bytes = base64ToBytes(base64Str);
  return decodeReplay(bytes);
}

/** 完整编码：ReplayData → base64字符串
 * TT源码 tP函数：从字节数组读取 a0N 个6位值（共 6*a0N 位）
 * 注意：不是编码所有字节，而是只编码 6*a0N 位
 */
export function encodeReplayToBase64(replay: ReplayData): string {
  const { bytes, dataBits } = encodeReplayInternal(replay);
  const a0N = Math.ceil(dataBits / 6);

  // TT源码 tP 函数：从字节数组读取 a0N 个6位值
  const reader = new BitReader(bytes);
  let result = '';
  for (let i = 0; i < a0N; i++) {
    result += TT_BASE64_TABLE[reader.read(6)];
  }
  return result;
}

/** 将回放字节数组重新编码为 TT Playback base64 字符串
 * 用于编辑后重编码：解码字节数组为 ReplayData，再用 encodeReplayToBase64 编码
 * 若解码失败则回退到按字节数编码（可能多1字符，但不丢失数据）
 */
export function replayBytesToBase64(bytes: number[]): string {
  try {
    const replay = decodeReplay(bytes);
    return encodeReplayToBase64(replay);
  } catch {
    // 解码失败时回退：直接按字节编码（floor 逻辑），保证不丢数据
    const a0N = Math.ceil(bytes.length * 8 / 6);
    const reader = new BitReader(bytes);
    let result = '';
    for (let i = 0; i < a0N; i++) {
      try {
        result += TT_BASE64_TABLE[reader.read(6)];
      } catch {
        result += TT_BASE64_TABLE[0];
      }
    }
    return result;
  }
}

// ============================================================
// 玩家信息提取与修改
// ============================================================

export interface PlayerInfo {
  index: number;
  nickname: string | null;
  accountHash: number | null;
  accountName: string | null; // 从哈希解码的5字符账户名
}

/** 从回放数据中提取玩家信息 */
export function extractPlayerInfo(replay: ReplayData): PlayerInfo[] {
  const players: PlayerInfo[] = [];
  const playerCount = replay.settings.playerCount;
  const nicknames = replay.settings.playerNamesData;
  const accountHashes = replay.settings.a61;

  for (let i = 0; i < playerCount; i++) {
    const nickname = nicknames && i < nicknames.length ? nicknames[i] : null;
    const accountHash = accountHashes && i < accountHashes.length ? accountHashes[i] : null;
    const accountName = accountHash !== null ? decodeAccountName(accountHash) : null;

    players.push({
      index: i,
      nickname,
      accountHash,
      accountName,
    });
  }

  return players;
}

/** 修改回放数据中的玩家昵称
 * @returns 新的ReplayData对象
 */
export function modifyNickname(replay: ReplayData, playerIndex: number, newNickname: string): ReplayData {
  const newReplay: ReplayData = JSON.parse(JSON.stringify(replay));

  if (!newReplay.settings.playerNamesData) {
    newReplay.settings.playerNamesData = new Array(newReplay.settings.playerCount).fill('');
  }

  // 确保数组足够长
  while (newReplay.settings.playerNamesData.length <= playerIndex) {
    newReplay.settings.playerNamesData.push('');
  }

  newReplay.settings.playerNamesData[playerIndex] = newNickname;
  return newReplay;
}

/** 修改回放数据中的账户名
 * @param newAccountName 新的5字符账户名
 * @returns 新的ReplayData对象
 */
export function modifyAccountName(replay: ReplayData, playerIndex: number, newAccountName: string): ReplayData {
  const newReplay: ReplayData = JSON.parse(JSON.stringify(replay));

  if (!newReplay.settings.a61) {
    newReplay.settings.a61 = new Array(newReplay.settings.playerCount).fill(0);
  }

  // 确保数组足够长
  while (newReplay.settings.a61.length <= playerIndex) {
    newReplay.settings.a61.push(0);
  }

  // 编码新的账户名为30位哈希
  newReplay.settings.a61[playerIndex] = encodeAccountName(newAccountName, 5);
  return newReplay;
}

// ============================================================
// 版本号提取
// ============================================================

/** 从回放代码中提取版本号
 * 版本号 = TABLE.indexOf(code[1])
 */
export function extractVersion(encodedInput: string): { code: string; version: number | null } {
  let cleanCode = encodedInput.trim();
  if (cleanCode.startsWith('https://')) {
    const match = cleanCode.match(/replay=([^&]+)/);
    if (match) {
      cleanCode = decodeURIComponent(match[1]);
    }
  }
  if (cleanCode.length < 2 || cleanCode[0] !== '-') {
    return { code: '??', version: null };
  }
  const code = cleanCode.substring(0, 2);
  const version = VERSION_TABLE.indexOf(code[1]);
  return { code, version: version >= 0 ? version : null };
}
