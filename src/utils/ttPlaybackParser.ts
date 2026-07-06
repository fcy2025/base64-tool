import {
  decodeReplay,
  encodeReplay,
  extractPlayerInfo,
  modifyNickname,
  modifyAccountName,
  extractVersion,
  type ReplayData as ReplayDataCodec,
} from './replayCodec';

export interface ParsedField {
  offset: number;
  length: number;
  name: string;
  type: 'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32' | 'float32' | 'string' | 'bytes' | 'utf16be' | 'utf16le' | 'mixed';
  value: number | string | number[] | boolean;
  description: string;
  editable: boolean;
  fieldType?: number;
  fieldId?: number;
  playerIndex?: number;
}

export interface ParsedSegment {
  offset: number;
  length: number;
  name: string;
  description: string;
  fields: ParsedField[];
  isGameRecord?: boolean;
}

export interface PlayerRecord {
  nickname: string;
  account: string | null;
  nicknameOffset: number;
  nicknameLength: number;
  accountOffset: number | null;
  accountLength: number | null;
}

export interface GameFunction {
  name: string;
  type: 'behavior' | 'attack' | 'build' | 'move' | 'resource' | 'diplomacy' | 'other';
  offset: number;
  length: number;
  description: string;
}

export const TABLE = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

const xC = new Uint8Array(78);
xC[50] = 37;
for (let aC = 0; aC < 10; aC++) { xC[aC + 3] = aC + 1; }
for (let aC = 0; aC < 26; aC++) { 
  xC[aC + 20] = aC + 11; 
  xC[aC + 52] = aC + 38; 
}

const a0M = new Uint8Array(64);
a0M[0] = 45;
a0M[37] = 95;
for (let aC = 0; aC < 10; aC++) { a0M[aC + 1] = 48 + aC; }
for (let aC = 0; aC < 26; aC++) { 
  a0M[aC + 11] = 65 + aC; 
  a0M[aC + 38] = 97 + aC; 
}

function xD(qj: string): string {
  return qj.trim().replace(/[^a-zA-Z0-9_\-]/g, '-');
}

function xE(qj: string, size: number): string {
  qj = xD(qj);
  if (qj.length > size) {
    return qj.substring(0, size);
  }
  while (qj.length < size) {
    qj = '-' + qj;
  }
  return qj;
}

function xF(qj: string): number[] {
  const h: number[] = [];
  for (let aC = 0; aC < qj.length; aC++) {
    const code = qj.charCodeAt(aC);
    h.push(xC[code - 45] || 0);
  }
  return h;
}

export function xM(qj: string, size: number): number {
  const h = xF(xE(qj, size));
  let fb = 0;
  let nh = 1;
  for (let aC = h.length - 1; aC >= 0; aC--) {
    fb += nh * h[aC];
    nh *= 64;
  }
  return fb;
}

export function hashToAccount(hash: number): string {
  let h = hash;
  const chars: string[] = [];
  for (let i = 0; i < 5; i++) {
    chars.unshift(TABLE[h % 64]);
    h = Math.floor(h / 64);
  }
  return chars.join('');
}

export const extractVersionCode = (encodedInput: string): { code: string; version: number | null } => {
  let cleanCode = encodedInput;
  if (cleanCode.startsWith('https://')) {
    const replayMatch = cleanCode.match(/replay=([^&]+)/);
    if (replayMatch) {
      cleanCode = decodeURIComponent(replayMatch[1]);
    }
  }
  if (cleanCode.length < 2) {
    return { code: '??', version: null };
  }
  const code = cleanCode.substring(0, 2);
  if (code[0] !== '-') {
    return { code: '??', version: null };
  }
  const version = TABLE.indexOf(code[1]);
  return { code, version: version >= 0 ? version : null };
};

class BitEncoder {
  h: number[] = [];
  eG = 0;

  di(): void {
    this.h = [];
    this.eG = 0;
  }

  a9(size: number, value: number): void {
    const nn = this.eG + size - 1;
    while (nn >= this.h.length) {
      this.h.push(0);
    }
    
    for (let aC = this.eG; aC <= nn; aC++) {
      const bitPos = nn - aC;
      const byteIdx = aC >> 3;
      const bitInByte = 7 - (aC & 7);
      this.h[byteIdx] |= (((value >> bitPos) & 1) << bitInByte);
    }
    
    this.eG += size;
  }

  dp(array: number[], itemSize: number, lengthSize: number): void {
    const actualLength = array.length;
    this.a9(lengthSize, actualLength);
    for (let i = 0; i < actualLength; i++) {
      this.a9(itemSize, array[i]);
    }
  }

  aXO(str: string, lenSize: number): void {
    const len = str.length;
    this.a9(lenSize, len);
    for (let i = 0; i < len; i++) {
      this.a9(16, str.charCodeAt(i));
    }
  }

  aXQ(arr: string[], lenSize: number, itemLenSize: number): void {
    const len = arr.length;
    this.a9(lenSize, len);
    for (let i = 0; i < len; i++) {
      this.aXO(arr[i], itemLenSize);
    }
  }
}

class BitDecoder {
  h: number[];
  eG = 0;

  constructor(bytes: number[]) {
    this.h = bytes;
  }

  qA(size: number): number {
    let result = 0;
    for (let i = 0; i < size; i++) {
      const byteIdx = this.eG >> 3;
      const bitInByte = 7 - (this.eG & 7);
      const bit = (this.h[byteIdx] >> bitInByte) & 1;
      result = (result << 1) | bit;
      this.eG++;
    }
    return result;
  }

  aX8(itemSize: number, lengthSize: number, minLength: number): number[] {
    const len = this.qA(lengthSize);
    const actualLen = Math.max(len, minLength);
    const h: number[] = [];
    for (let i = 0; i < len; i++) {
      h.push(this.qA(itemSize));
    }
    if (len > 0) {
      const fillValue = h[len - 1];
      for (let i = len; i < actualLen; i++) {
        h.push(fillValue);
      }
    }
    return h;
  }

  aX9(lenSize: number, itemLenSize: number, minLength: number): string[] {
    const len = this.qA(lenSize);
    const actualLen = Math.max(len, minLength);
    const h: string[] = [];
    for (let i = 0; i < len; i++) {
      h.push(this.aX6(itemLenSize));
    }
    if (len > 0) {
      const fillValue = h[len - 1];
      for (let i = len; i < actualLen; i++) {
        h.push(fillValue);
      }
    }
    return h;
  }

  aX6(lenSize: number): string {
    const len = this.qA(lenSize);
    let result = '';
    for (let i = 0; i < len; i++) {
      result += String.fromCharCode(this.qA(16));
    }
    return result;
  }
}

function calculateChecksum(bytes: number[], version: number): number {
  let sum = version;
  for (let i = 3; i < bytes.length; i++) {
    sum = (sum + bytes[i]) & 4095;
  }
  return sum;
}

function tP(length: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    result.push(Math.floor(Math.random() * 64));
  }
  return result;
}

function tO(indices: number[]): string {
  const result: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    result.push(String.fromCharCode(a0M[indices[i]]));
  }
  return result.join('');
}

function a0P(value: number, length: number): string {
  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    result.push(String.fromCharCode(a0M[(value >> ((length - 1 - i) * 6)) & 63]));
  }
  return result.join('');
}

function bytesTo6BitIndices(bytes: number[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    
    const group = (byte1 << 16) | (byte2 << 8) | byte3;
    
    indices.push((group >> 18) & 0x3F);
    indices.push((group >> 12) & 0x3F);
    
    if (i + 1 < bytes.length) {
      indices.push((group >> 6) & 0x3F);
    }
    
    if (i + 2 < bytes.length) {
      indices.push(group & 0x3F);
    }
  }
  return indices;
}

function indicesToBytes(indices: number[]): number[] {
  const bytes: number[] = [];
  
  for (let i = 0; i < indices.length; i += 4) {
    const idx1 = indices[i];
    const idx2 = i + 1 < indices.length ? indices[i + 1] : 0;
    const idx3 = i + 2 < indices.length ? indices[i + 2] : 0;
    const idx4 = i + 3 < indices.length ? indices[i + 3] : 0;
    
    const group = (idx1 << 18) | (idx2 << 12) | (idx3 << 6) | idx4;
    
    bytes.push((group >> 16) & 0xFF);
    
    if (i + 1 < indices.length) {
      bytes.push((group >> 8) & 0xFF);
    }
    
    if (i + 2 < indices.length) {
      bytes.push(group & 0xFF);
    }
  }
  
  return bytes;
}

function decodeBase64(encoded: string): number[] {
  let cleanInput = encoded;
  if (cleanInput.startsWith('https://')) {
    const replayMatch = cleanInput.match(/replay=([^&]+)/);
    if (replayMatch) {
      cleanInput = decodeURIComponent(replayMatch[1]);
    }
  }
  
  const indices: number[] = [];
  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const idx = TABLE.indexOf(char);
    if (idx >= 0) {
      indices.push(idx);
    }
  }
  
  return indicesToBytes(indices);
}

function encodeBase64(bytes: number[]): string {
  const indices = bytesTo6BitIndices(bytes);
  return tO(indices);
}

export interface ReplayData {
  version: number;
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
  elo: number[];
  colorsType: number;
  colorsPersonalized: number;
  colorsData: number[];
  selectableColor: number;
  teamPlayerCount: number[];
  neutralBots: number;
  botDifficultyType: number;
  botDifficultyValue: number;
  botDifficultyTeam: number[];
  botDifficultyData: number[];
  spawningType: number;
  spawningSeed: number;
  spawningData: number[];
  selectableSpawn: number;
  playerNamesType: number;
  playerNamesData: string[];
  selectableName: number;
  aIncomeType: number;
  aIncomeValue: number;
  aIncomeData: number[];
  tIncomeType: number;
  tIncomeValue: number;
  tIncomeData: number[];
  iIncomeType: number;
  iIncomeValue: number;
  iIncomeData: number[];
  sResourcesType: number;
  sResourcesValue: number;
  sResourcesData: number[];
  a61: number[];
  events: { id: number; player: number; value1?: number; value2?: number }[];
  eventCounts: { type: number; count: number }[];
}

export function decodeReplayData(encodedInput: string): ReplayData | null {
  const versionInfo = extractVersionCode(encodedInput);
  if (versionInfo.version === null) return null;
  
  const bytes = decodeBase64(encodedInput);
  const decoder = new BitDecoder(bytes);
  
  const version = decoder.qA(12);
  decoder.eG += 12 + 31;
  
  const mapType = decoder.qA(2);
  const mapProceduralIndex = decoder.qA(8);
  const mapRealisticIndex = decoder.qA(8);
  const mapSeed = decoder.qA(14);
  const mapName = decoder.aX6(5);
  
  const passableWater = decoder.qA(1);
  const passableMountains = decoder.qA(1);
  const playerCount = decoder.qA(10);
  const humanCount = decoder.qA(10);
  const selectedPlayer = decoder.qA(9);
  const gameMode = decoder.qA(1);
  const playerMode = decoder.qA(2);
  const battleRoyaleMode = decoder.qA(2);
  const numberTeams = decoder.qA(4);
  const isZombieMode = decoder.qA(1);
  const isContest = decoder.qA(1);
  const isReplay = decoder.qA(1);
  const elo = decoder.aX8(2, 14, 0);
  const colorsType = decoder.qA(1);
  const colorsPersonalized = decoder.qA(1);
  const colorsData = decoder.aX8(10, 18, 512);
  const selectableColor = decoder.qA(1);
  const teamPlayerCount = decoder.aX8(4, 10, 9);
  const neutralBots = decoder.qA(1);
  const botDifficultyType = decoder.qA(2);
  const botDifficultyValue = decoder.qA(4);
  const botDifficultyTeam = decoder.aX8(4, 4, 9);
  const botDifficultyData = decoder.aX8(10, 4, 512);
  const spawningType = decoder.qA(2);
  const spawningSeed = decoder.qA(14);
  const spawningData = decoder.aX8(11, 12, 1024);
  const selectableSpawn = decoder.qA(1);
  const playerNamesType = decoder.qA(2);
  const playerNamesData = decoder.aX9(10, 5, 512);
  const selectableName = decoder.qA(1);
  const aIncomeType = decoder.qA(2);
  const aIncomeValue = decoder.qA(8);
  const aIncomeData = decoder.aX8(10, 8, 512);
  const tIncomeType = decoder.qA(2);
  const tIncomeValue = decoder.qA(8);
  const tIncomeData = decoder.aX8(10, 8, 512);
  const iIncomeType = decoder.qA(2);
  const iIncomeValue = decoder.qA(8);
  const iIncomeData = decoder.aX8(10, 8, 512);
  const sResourcesType = decoder.qA(2);
  const sResourcesValue = decoder.qA(11);
  const sResourcesData = decoder.aX8(10, 11, 512);
  const a61 = decoder.aX8(10, 30, 0);
  
  const xQ = decoder.qA(5);
  const eventCount = decoder.qA(30);
  const eventTypeCount = decoder.qA(30);
  
  const events: { id: number; player: number; value1?: number; value2?: number }[] = [];
  for (let i = 0; i < eventCount; i++) {
    const id = decoder.qA(4);
    const player = decoder.qA(9);
    if (id === 0) {
      events.push({ id, player, value1: decoder.qA(22) });
    } else if (id === 1) {
      events.push({ id, player, value1: decoder.qA(10), value2: decoder.qA(10) });
    } else if (id === 2) {
      events.push({ id, player, value1: decoder.qA(10), value2: decoder.qA(9) });
    } else if (id === 3) {
      events.push({ id, player, value1: decoder.qA(10), value2: decoder.qA(27) });
    } else if (id === 4) {
      events.push({ id, player, value1: decoder.qA(10), value2: decoder.qA(16) });
    } else if (id === 5) {
      events.push({ id, player, value1: decoder.qA(10) });
    } else if (id === 6) {
      events.push({ id, player, value1: decoder.qA(10) });
    } else if (id === 7) {
      events.push({ id, player, value1: decoder.qA(1) });
    } else if (id === 10) {
      events.push({ id, player, value1: decoder.qA(20), value2: decoder.qA(22) });
    }
  }
  
  const eventCounts: { type: number; count: number }[] = [];
  for (let i = 0; i < eventTypeCount; i++) {
    eventCounts.push({ type: decoder.qA(1), count: decoder.qA(xQ) });
  }
  
  return {
    version,
    mapType,
    mapProceduralIndex,
    mapRealisticIndex,
    mapSeed,
    mapName,
    passableWater,
    passableMountains,
    playerCount,
    humanCount,
    selectedPlayer,
    gameMode,
    playerMode,
    battleRoyaleMode,
    numberTeams,
    isZombieMode,
    isContest,
    isReplay,
    elo,
    colorsType,
    colorsPersonalized,
    colorsData,
    selectableColor,
    teamPlayerCount,
    neutralBots,
    botDifficultyType,
    botDifficultyValue,
    botDifficultyTeam,
    botDifficultyData,
    spawningType,
    spawningSeed,
    spawningData,
    selectableSpawn,
    playerNamesType,
    playerNamesData,
    selectableName,
    aIncomeType,
    aIncomeValue,
    aIncomeData,
    tIncomeType,
    tIncomeValue,
    tIncomeData,
    iIncomeType,
    iIncomeValue,
    iIncomeData,
    sResourcesType,
    sResourcesValue,
    sResourcesData,
    a61,
    events,
    eventCounts,
  };
}

export function encodeReplayData(data: ReplayData): string {
  const encoder = new BitEncoder();
  
  encoder.a9(12, data.version);
  encoder.eG += 12 + 31;
  
  encoder.a9(2, data.mapType);
  encoder.a9(8, data.mapProceduralIndex);
  encoder.a9(8, data.mapRealisticIndex);
  encoder.a9(14, data.mapSeed);
  encoder.aXO(data.mapName, 5);
  
  encoder.a9(1, data.passableWater);
  encoder.a9(1, data.passableMountains);
  encoder.a9(10, data.playerCount);
  encoder.a9(10, data.humanCount);
  encoder.a9(9, data.selectedPlayer);
  encoder.a9(1, data.gameMode);
  encoder.a9(2, data.playerMode);
  encoder.a9(2, data.battleRoyaleMode);
  encoder.a9(4, data.numberTeams);
  encoder.a9(1, data.isZombieMode);
  encoder.a9(1, data.isContest);
  encoder.a9(1, data.isReplay);
  encoder.dp(data.elo, 2, 14);
  encoder.a9(1, data.colorsType);
  encoder.a9(1, data.colorsPersonalized);
  encoder.dp(data.colorsData, 10, 18);
  encoder.a9(1, data.selectableColor);
  encoder.dp(data.teamPlayerCount, 4, 10);
  encoder.a9(1, data.neutralBots);
  encoder.a9(2, data.botDifficultyType);
  encoder.a9(4, data.botDifficultyValue);
  encoder.dp(data.botDifficultyTeam, 4, 4);
  encoder.dp(data.botDifficultyData, 10, 4);
  encoder.a9(2, data.spawningType);
  encoder.a9(14, data.spawningSeed);
  encoder.dp(data.spawningData, 11, 12);
  encoder.a9(1, data.selectableSpawn);
  encoder.a9(2, data.playerNamesType);
  encoder.aXQ(data.playerNamesData, 10, 5);
  encoder.a9(1, data.selectableName);
  encoder.a9(2, data.aIncomeType);
  encoder.a9(8, data.aIncomeValue);
  encoder.dp(data.aIncomeData, 10, 8);
  encoder.a9(2, data.tIncomeType);
  encoder.a9(8, data.tIncomeValue);
  encoder.dp(data.tIncomeData, 10, 8);
  encoder.a9(2, data.iIncomeType);
  encoder.a9(8, data.iIncomeValue);
  encoder.dp(data.iIncomeData, 10, 8);
  encoder.a9(2, data.sResourcesType);
  encoder.a9(11, data.sResourcesValue);
  encoder.dp(data.sResourcesData, 10, 11);
  encoder.dp(data.a61, 10, 30);
  
  const xQ = Math.max(...data.eventCounts.map(e => e.count), 1);
  encoder.a9(5, xQ);
  encoder.a9(30, data.events.length);
  encoder.a9(30, data.eventCounts.length);
  
  for (const event of data.events) {
    encoder.a9(4, event.id);
    encoder.a9(9, event.player);
    if (event.id === 0) {
      encoder.a9(22, event.value1 || 0);
    } else if (event.id === 1) {
      encoder.a9(10, event.value1 || 0);
      encoder.a9(10, event.value2 || 0);
    } else if (event.id === 2) {
      encoder.a9(10, event.value1 || 0);
      encoder.a9(9, event.value2 || 0);
    } else if (event.id === 3) {
      encoder.a9(10, event.value1 || 0);
      encoder.a9(27, event.value2 || 0);
    } else if (event.id === 4) {
      encoder.a9(10, event.value1 || 0);
      encoder.a9(16, event.value2 || 0);
    } else if (event.id === 5) {
      encoder.a9(10, event.value1 || 0);
    } else if (event.id === 6) {
      encoder.a9(10, event.value1 || 0);
    } else if (event.id === 7) {
      encoder.a9(1, event.value1 || 0);
    } else if (event.id === 10) {
      encoder.a9(20, event.value1 || 0);
      encoder.a9(22, event.value2 || 0);
    }
  }
  
  for (const ec of data.eventCounts) {
    encoder.a9(1, ec.type);
    encoder.a9(xQ, ec.count);
  }
  
  const encodedLength = encoder.h.length;
  const charCount = Math.floor((encodedLength * 8 + 5) / 6);
  if (charCount * 6 / 8 !== encoder.h.length) {
    encoder.h.push(0);
  }
  
  const checksum = calculateChecksum(encoder.h, data.version);
  const dataLength = encoder.h.length;
  
  encoder.h[12] = (checksum >> 4) & 0xFF;
  encoder.h[13] = ((checksum & 0xF) << 4) | ((dataLength >> 8) & 0xF);
  encoder.h[14] = dataLength & 0xFF;
  
  return encodeBase64(encoder.h);
}

export function replaceAccountHash(data: ReplayData, oldAccount: string, newAccount: string): ReplayData {
  const oldHash = xM(oldAccount, 5);
  const newHash = xM(newAccount, 5);
  
  const newA61 = data.a61.map(hash => hash === oldHash ? newHash : hash);
  
  return {
    ...data,
    a61: newA61,
  };
}

export function replaceNickname(data: ReplayData, oldNickname: string, newNickname: string): ReplayData {
  const newNames = data.playerNamesData.map(name => name === oldNickname ? newNickname : name);
  
  return {
    ...data,
    playerNamesData: newNames,
  };
}

const readUint8 = (bytes: number[], offset: number): number => bytes[offset];
const readUint16LE = (bytes: number[], offset: number): number => (bytes[offset + 1] << 8) | bytes[offset];
const readUint16BE = (bytes: number[], offset: number): number => (bytes[offset] << 8) | bytes[offset + 1];
const readUint32LE = (bytes: number[], offset: number): number => (bytes[offset + 3] << 24) | (bytes[offset + 2] << 16) | (bytes[offset + 1] << 8) | bytes[offset];
const readUint32BE = (bytes: number[], offset: number): number => (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset];

const isValidUTF16Char = (code: number): boolean => {
  if (code === 0) return false;
  if (code >= 0x0020 && code <= 0x007E) return true;
  if (code >= 0x00A0 && code <= 0x00FF) return true;
  if (code >= 0x3040 && code <= 0x30FF) return true;
  if (code >= 0xAC00 && code <= 0xD7AF) return true;
  if (code >= 0x4E00 && code <= 0x9FFF) return true;
  if (code >= 0xD800 && code <= 0xDFFF) return true;
  if (code >= 0x10000 && code <= 0x10FFFF) return true;
  return false;
};

const isValidPrintableChar = (code: number): boolean => {
  if (code === 0) return false;
  if (code >= 0x0020 && code <= 0x007E) return true;
  if (code >= 0x00A0 && code <= 0x00FF) return true;
  if (code >= 0x3040 && code <= 0x30FF) return true;
  if (code >= 0xAC00 && code <= 0xD7AF) return true;
  if (code >= 0x4E00 && code <= 0x9FFF) return true;
  return false;
};

const isValidAsciiChar = (code: number): boolean => {
  return code >= 0x20 && code <= 0x7E;
};

const isValidStringContent = (value: string): boolean => {
  if (value.length === 0) return false;
  
  if (value.length === 1) {
    return value.includes('[') || value.includes(']') || value === '-';
  }
  
  if (value.length === 2) {
    return value === '[CN]' || value === '[cn]';
  }
  
  const printableCount = [...value].filter(c => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) <= 0x7E).length;
  const nonCJKCount = [...value].filter(c => {
    const code = c.charCodeAt(0);
    return code < 0x4E00 || code > 0x9FFF;
  }).length;
  
  if (nonCJKCount > 0) {
    const printableRatio = printableCount / nonCJKCount;
    if (printableRatio < 0.6) return false;
  }
  
  const hasLetter = [...value].some(c => /[a-zA-Z]/.test(c));
  const hasDigit = [...value].some(c => /[0-9]/.test(c));
  const hasBracket = value.includes('[') || value.includes(']');
  const hasCJK = [...value].some(c => {
    const code = c.charCodeAt(0);
    return code >= 0x4E00 && code <= 0x9FFF;
  });
  
  const invalidChars = [...value].filter(c => {
    const code = c.charCodeAt(0);
    return (code >= 0x80 && code < 0xA0) || (code >= 0xFDD0 && code <= 0xFDEF);
  });
  
  if (invalidChars.length > 0) return false;
  
  return hasLetter || hasDigit || hasBracket || hasCJK;
};

const isKnownNicknamePattern = (value: string): boolean => {
  if (value.length === 0) return false;
  
  if (value.length === 2) {
    return value === '[CN]' || value === '[cn]';
  }
  
  if (value.length === 3) {
    if (value === 'HELLO') return true;
    if (value === 'Him') return true;
    if (value === '19🥷') return true;
    if (/^[A-Za-z]{3}$/.test(value)) return true;
  }
  
  if (value.includes('[CN]') || value.includes('[cn]') || 
      value.includes('[CN][') || value.includes('[cn][') ||
      value.includes('[BR]') || value.includes('[OG]') ||
      value.includes('[CORGI]') || value.includes('[VOID]') ||
      value.includes('[CN]') || value.includes('[EU]') ||
      value.includes('[UA]') || value.includes('[JP]') ||
      value.includes('[TR]') || value.includes('[IDN]') ||
      value.includes('[AZE]') || value.includes('[ARM]') ||
      value.includes('[FR]') || value.includes('[RO]') ||
      value.includes('[PL]') || value.includes('[HK]') ||
      value.includes('[IND]') || value.includes('[KILR]') ||
      value.includes('[OMEN]') || value.includes('[NEW]') ||
      value.includes('[HEL]') || value.includes('[PF]') ||
      value.includes('[RU]') || value.includes('[CH]') ||
      value.includes('[CA]') || value.includes('[DE]') ||
      value.includes('[GB]') || value.includes('[IT]') ||
      value.includes('[ES]') || value.includes('[PT]') ||
      value.includes('[NL]') || value.includes('[BE]') ||
      value.includes('[DK]') || value.includes('[NO]') ||
      value.includes('[SE]') || value.includes('[FI]') ||
      value.includes('[HU]') || value.includes('[AT]') ||
      value.includes('[CZ]') || value.includes('[SK]') ||
      value.includes('[HR]') || value.includes('[SI]') ||
      value.includes('[BA]') || value.includes('[RS]') ||
      value.includes('[BG]') || value.includes('[GR]') ||
      value.includes('[CY]') || value.includes('[MT]') ||
      value.includes('[LV]') || value.includes('[LT]') ||
      value.includes('[EE]') || value.includes('[PL]') ||
      value.includes('[RO]') || value.includes('[HU]')) {
    return true;
  }
  
  const cjkCount = [...value].filter(c => {
    const code = c.charCodeAt(0);
    return code >= 0x4E00 && code <= 0x9FFF;
  }).length;
  
  if (cjkCount >= 1) {
    const validRatio = cjkCount / value.length;
    if (validRatio >= 0.3) return true;
  }
  
  const letterCount = [...value].filter(c => /[a-zA-Z]/.test(c)).length;
  const digitCount = [...value].filter(c => /[0-9]/.test(c)).length;
  const bracketCount = [...value].filter(c => c === '[' || c === ']').length;
  const spaceCount = [...value].filter(c => c === ' ').length;
  
  const totalVisible = letterCount + digitCount + cjkCount + bracketCount + spaceCount;
  
  if (totalVisible >= 2) {
    const validRatio = totalVisible / value.length;
    if (validRatio >= 0.7) {
      if (letterCount >= 1 || digitCount >= 1 || cjkCount >= 1) {
        return true;
      }
    }
  }
  
  const knownPatterns = [
    /^Player \d+$/,
    /^[A-Za-z][A-Za-z0-9_\-]{2,15}$/,
    /^[\u4E00-\u9FFF]{2,10}$/,
    /^\[.+\]$/,
    /^[A-Za-z][A-Za-z0-9_\- ]{1,20}$/,
    /^[A-Za-z0-9_\- ]{3,20}$/,
    /^[A-Za-z0-9_\-]{2,20}$/,
    /^[A-Za-z][A-Za-z0-9_\-]{1,15}[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{0,3}$/,
    /^[A-Za-z0-9_\- ]{2,10}[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{0,5}$/,
    /^[A-Za-z]{2,6} ?[0-9]{1,4}$/,
    /^[A-Za-z0-9_\-]{3,10}[!@#$%^&*]{0,3}$/,
    /^[A-Za-z]{2,20}$/,
    /^[A-Za-z0-9_\-]{2,8}$/,
    /^[\u4E00-\u9FFF]+[A-Za-z0-9_\-\[\] ]*$/,
    /^[A-Za-z0-9_\-\[\] ]*[\u4E00-\u9FFF]+[A-Za-z0-9_\-\[\] ]*$/,
  ];
  
  return knownPatterns.some(pattern => pattern.test(value));
};

const extractUTF16BEString = (bytes: number[], offset: number, maxLen: number = 128): { value: string; length: number; valid: boolean } => {
  const chars: string[] = [];
  let pos = offset;
  let consecutiveInvalid = 0;

  while (pos < bytes.length - 1 && chars.length < maxLen && consecutiveInvalid < 3) {
    const b1 = bytes[pos];
    const b2 = bytes[pos + 1];
    const code = (b1 << 8) | b2;

    if (code === 0x0000) {
      pos += 2;
      break;
    }

    const nextPos = pos + 2;
    if (nextPos + 2 < bytes.length) {
      const nextTypeLE = readUint16LE(bytes, nextPos);
      const nextFieldId = bytes[nextPos + 2];
      if ([0x0002, 0x0004, 0x0008, 0x0001, 0x0010, 0x0020].includes(nextTypeLE) && 
          nextFieldId > 0 && nextFieldId <= 0xFF && 
          nextPos % 2 === 0) {
        if (isValidUTF16Char(code) || (b1 === 0x00 && b2 !== 0x00)) {
          chars.push(String.fromCharCode(code));
        }
        pos += 2;
        break;
      }
    }

    if (b1 >= 0xD8 && b1 <= 0xDB && nextPos + 1 < bytes.length) {
      const b3 = bytes[nextPos];
      const b4 = bytes[nextPos + 1];
      if (b3 >= 0xDC && b3 <= 0xDF) {
        const highSurrogate = code;
        const lowSurrogate = (b3 << 8) | b4;
        const actualCode = ((highSurrogate - 0xD800) << 10) + (lowSurrogate - 0xDC00) + 0x10000;
        chars.push(String.fromCodePoint(actualCode));
        pos += 4;
        consecutiveInvalid = 0;
        continue;
      }
    }

    if ((b1 === 0x00 && b2 !== 0x00) || (b2 === 0x00 && b1 !== 0x00)) {
      chars.push(String.fromCharCode(code));
      pos += 2;
      consecutiveInvalid = 0;
    } else if (isValidUTF16Char(code)) {
      chars.push(String.fromCharCode(code));
      pos += 2;
      consecutiveInvalid = 0;
    } else {
      consecutiveInvalid++;
      if (consecutiveInvalid >= 2) break;
      pos += 2;
    }
  }

  const value = chars.join('');
  const valid = isValidStringContent(value);

  return { value, length: pos - offset, valid };
};

const extractUTF16BEStringSimple = (bytes: number[], offset: number): { value: string; length: number; valid: boolean } => {
  const chars: string[] = [];
  let pos = offset;
  
  while (pos < bytes.length - 1) {
    const b1 = bytes[pos];
    const b2 = bytes[pos + 1];
    const code = (b1 << 8) | b2;

    if (code === 0x0000) {
      pos += 2;
      break;
    }

    if (b1 >= 0xD8 && b1 <= 0xDB && pos + 3 < bytes.length) {
      const b3 = bytes[pos + 2];
      const b4 = bytes[pos + 3];
      if (b3 >= 0xDC && b3 <= 0xDF) {
        const high = code;
        const low = (b3 << 8) | b4;
        const actualCode = ((high - 0xD800) << 10) + (low - 0xDC00) + 0x10000;
        chars.push(String.fromCodePoint(actualCode));
        pos += 4;
        continue;
      }
    }

    if (b1 === 0x00 && b2 !== 0x00) {
      chars.push(String.fromCharCode(code));
      pos += 2;
    } else if (isValidUTF16Char(code)) {
      chars.push(String.fromCharCode(code));
      pos += 2;
    } else {
      break;
    }
  }

  const value = chars.join('');
  const valid = isValidStringContent(value);

  return { value, length: pos - offset, valid };
};

const extractUTF16LEString = (bytes: number[], offset: number): { value: string; length: number; valid: boolean } => {
  const chars: string[] = [];
  let pos = offset;
  
  while (pos < bytes.length - 1) {
    const b1 = bytes[pos];
    const b2 = bytes[pos + 1];
    const code = (b2 << 8) | b1;

    if (code === 0x0000) {
      pos += 2;
      break;
    }

    if (b2 >= 0xD8 && b2 <= 0xDB && pos + 3 < bytes.length) {
      const b3 = bytes[pos + 2];
      const b4 = bytes[pos + 3];
      if (b3 >= 0xDC && b3 <= 0xDF) {
        const high = code;
        const low = (b4 << 8) | b3;
        const actualCode = ((high - 0xD800) << 10) + (low - 0xDC00) + 0x10000;
        chars.push(String.fromCodePoint(actualCode));
        pos += 4;
        continue;
      }
    }

    if (b2 === 0x00 && b1 !== 0x00) {
      chars.push(String.fromCharCode(code));
      pos += 2;
    } else if (isValidUTF16Char(code)) {
      chars.push(String.fromCharCode(code));
      pos += 2;
    } else {
      break;
    }
  }

  const value = chars.join('');
  const valid = isValidStringContent(value);

  return { value, length: pos - offset, valid };
};

const extractAsciiString = (bytes: number[], offset: number, maxLen: number = 128): { value: string; length: number; valid: boolean } => {
  const chars: string[] = [];
  let pos = offset;

  while (pos < bytes.length && chars.length < maxLen) {
    const b = bytes[pos];
    if (b === 0) {
      pos++;
      break;
    }
    if (isValidAsciiChar(b)) {
      chars.push(String.fromCharCode(b));
      pos++;
    } else {
      break;
    }
  }

  const value = chars.join('');
  const valid = isValidStringContent(value) && value.length >= 2;

  return { value, length: pos - offset, valid };
};

const parseFieldsV20 = (bytes: number[]): { offset: number; fieldType: number; fieldId: number; value: string | number; length: number; description: string }[] => {
  const fields: { offset: number; fieldType: number; fieldId: number; value: string | number; length: number; description: string }[] = [];
  
  const VALID_TYPES = [0x0002, 0x0004, 0x0008, 0x0001, 0x0010, 0x0020];
  
  let offset = 0;
  while (offset < bytes.length - 2) {
    const fieldTypeLE = readUint16LE(bytes, offset);
    
    if (!VALID_TYPES.includes(fieldTypeLE)) {
      offset++;
      continue;
    }

    const fieldIdLE = bytes[offset + 2];

    if (fieldTypeLE === 0x0002) {
      const { value, length } = extractUTF16BEString(bytes, offset + 3);
      fields.push({
        offset,
        fieldType: fieldTypeLE,
        fieldId: fieldIdLE,
        value,
        length: 3 + length,
        description: `字符串(ID=0x${fieldIdLE.toString(16).padStart(2, '0')}): "${value}"`,
      });
      offset += 3 + length;
    } else if (fieldTypeLE === 0x0004) {
      if (offset + 6 < bytes.length) {
        const intValue = readUint32LE(bytes, offset + 3);
        fields.push({
          offset,
          fieldType: fieldTypeLE,
          fieldId: fieldIdLE,
          value: intValue,
          length: 7,
          description: `32位整数(ID=0x${fieldIdLE.toString(16).padStart(2, '0')}): ${intValue}`,
        });
        offset += 7;
      } else {
        offset++;
      }
    } else if (fieldTypeLE === 0x0008) {
      if (offset + 6 < bytes.length) {
        const view = new DataView(new Uint8Array(bytes.slice(offset + 3, offset + 7)).buffer);
        const floatValue = view.getFloat32(0, true);
        fields.push({
          offset,
          fieldType: fieldTypeLE,
          fieldId: fieldIdLE,
          value: floatValue,
          length: 7,
          description: `32位浮点(ID=0x${fieldIdLE.toString(16).padStart(2, '0')}): ${floatValue}`,
        });
        offset += 7;
      } else {
        offset++;
      }
    } else if (fieldTypeLE === 0x0001) {
      if (offset + 3 < bytes.length) {
        fields.push({
          offset,
          fieldType: fieldTypeLE,
          fieldId: fieldIdLE,
          value: bytes[offset + 3],
          length: 4,
          description: `8位字节(ID=0x${fieldIdLE.toString(16).padStart(2, '0')}): ${bytes[offset + 3]}`,
        });
        offset += 4;
      } else {
        offset++;
      }
    } else if (fieldTypeLE === 0x0010) {
      if (offset + 4 < bytes.length) {
        const intValue = readUint16LE(bytes, offset + 3);
        fields.push({
          offset,
          fieldType: fieldTypeLE,
          fieldId: fieldIdLE,
          value: intValue,
          length: 5,
          description: `16位整数(ID=0x${fieldIdLE.toString(16).padStart(2, '0')}): ${intValue}`,
        });
        offset += 5;
      } else {
        offset++;
      }
    } else if (fieldTypeLE === 0x0020) {
      fields.push({
        offset,
        fieldType: fieldTypeLE,
        fieldId: fieldIdLE,
        value: 0,
        length: 11,
        description: `64位整数(ID=0x${fieldIdLE.toString(16).padStart(2, '0')})`,
      });
      offset += 11;
    } else {
      offset++;
    }
  }

  return fields;
};

export const findValidStrings = (bytes: number[], version: number | null): { offset: number; length: number; value: string; encoding: string; valid: boolean }[] => {
  const results: { offset: number; length: number; value: string; encoding: string; valid: boolean }[] = [];
  const usedOffsets = new Set<number>();
  const seenValues = new Set<string>();

  const ALL_VALID_TYPES = [0x0002, 0x0004, 0x0008, 0x0001, 0x0010, 0x0020];

  for (let i = 0; i < bytes.length - 2; i++) {
    const fieldTypeLE = readUint16LE(bytes, i);
    const fieldId = bytes[i + 2];

    if (ALL_VALID_TYPES.includes(fieldTypeLE) && fieldId > 0 && fieldId <= 0xFF) {
      if (fieldTypeLE === 0x0002) {
        const strStart = i + 3;
        
        if (strStart < bytes.length && bytes[strStart] === 0x00) {
          const { value, length, valid } = extractUTF16BEStringSimple(bytes, strStart);
          
          if (valid && value.length >= 1 && !seenValues.has(value)) {
            const fieldLength = 3 + length;
            
            results.push({ 
              offset: strStart, 
              length: fieldLength, 
              value, 
              encoding: 'UTF-16BE', 
              valid 
            });
            seenValues.add(value);
            
            for (let j = i; j < i + fieldLength && j < bytes.length; j++) {
              usedOffsets.add(j);
            }
            
            i += fieldLength - 1;
            continue;
          }
        }
      }

      let skipLength = 0;
      if (fieldTypeLE === 0x0004) skipLength = 7;
      else if (fieldTypeLE === 0x0008) skipLength = 7;
      else if (fieldTypeLE === 0x0001) skipLength = 4;
      else if (fieldTypeLE === 0x0010) skipLength = 5;
      else if (fieldTypeLE === 0x0020) skipLength = 11;
      
      if (skipLength > 0 && i + skipLength <= bytes.length) {
        for (let j = i; j < i + skipLength; j++) {
          usedOffsets.add(j);
        }
        i += skipLength - 1;
        continue;
      }
    }
  }

  for (let i = 0; i < bytes.length - 1; i++) {
    if (usedOffsets.has(i)) continue;
    
    if (bytes[i] === 0x00 && bytes[i + 1] !== 0x00) {
      const { value, length, valid } = extractUTF16BEStringSimple(bytes, i);
      
      if (valid && value.length >= 1 && !seenValues.has(value)) {
        const isSubstring = results.some(r => r.value.includes(value) && r.value !== value);
        
        if (!isSubstring) {
          results.push({ offset: i, length, value, encoding: 'UTF-16BE', valid });
          seenValues.add(value);
          
          for (let j = i; j < i + length && j < bytes.length; j++) {
            usedOffsets.add(j);
          }
        }
      }
      
      i += length - 1;
    }
  }

  for (let i = 0; i < bytes.length - 1; i++) {
    if (usedOffsets.has(i)) continue;
    
    if (bytes[i + 1] === 0x00 && bytes[i] !== 0x00) {
      const { value, length, valid } = extractUTF16LEString(bytes, i);
      
      if (valid && value.length >= 2 && !seenValues.has(value)) {
        const isSubstring = results.some(r => r.value.includes(value) && r.value !== value);
        
        if (!isSubstring) {
          results.push({ offset: i, length, value, encoding: 'UTF-16LE', valid });
          seenValues.add(value);
          
          for (let j = i; j < i + length && j < bytes.length; j++) {
            usedOffsets.add(j);
          }
        }
      }
      
      i += length - 1;
    }
  }

  for (let i = 0; i < bytes.length; i++) {
    if (usedOffsets.has(i)) continue;
    
    if ((bytes[i] >= 0x41 && bytes[i] <= 0x5A) || (bytes[i] >= 0x61 && bytes[i] <= 0x7A) || bytes[i] === 0x5B) {
      const { value, length, valid } = extractAsciiString(bytes, i);
      
      if (valid && value.length >= 2 && !seenValues.has(value)) {
        results.push({ offset: i, length, value, encoding: 'ASCII', valid });
        seenValues.add(value);
        
        for (let j = i; j < i + length && j < bytes.length; j++) {
          usedOffsets.add(j);
        }
      }
    }
  }

  return results.sort((a, b) => a.offset - b.offset);
};

export const findAccountNames = (bytes: number[], encodedInput?: string): { offset: number; value: string; length: number; source: 'bytes' | 'encoded' }[] => {
  const results: { offset: number; value: string; length: number; source: 'bytes' | 'encoded' }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < bytes.length - 4; i++) {
    let valid = true;
    const chars: string[] = [];

    for (let j = 0; j < 5; j++) {
      const b = bytes[i + j];
      if (b === 0) {
        valid = false;
        break;
      }
      if (b >= 0x41 && b <= 0x5A) {
        chars.push(String.fromCharCode(b));
      } else if (b >= 0x61 && b <= 0x7A) {
        chars.push(String.fromCharCode(b));
      } else if (b >= 0x30 && b <= 0x39) {
        chars.push(String.fromCharCode(b));
      } else if (b === 0x5F || b === 0x2D) {
        chars.push(String.fromCharCode(b));
      } else {
        valid = false;
        break;
      }
    }

    if (valid) {
      const allSame = chars.every(c => c === chars[0]);
      if (!allSame) {
        const prevByte = i > 0 ? bytes[i - 1] : 0xFF;
        const nextByte = bytes[i + 5] || 0xFF;
        if ((prevByte < 0x20 || prevByte > 0x7E || prevByte === 0) &&
            (nextByte < 0x20 || nextByte > 0x7E || nextByte === 0)) {
          const value = chars.join('');
          if (!seen.has(value)) {
            results.push({ offset: i, value, length: 5, source: 'bytes' });
            seen.add(value);
          }
        }
      }
    }
  }

  if (encodedInput) {
    let cleanInput = encodedInput;
    if (cleanInput.startsWith('https://')) {
      const replayMatch = cleanInput.match(/replay=([^&]+)/);
      if (replayMatch) {
        cleanInput = decodeURIComponent(replayMatch[1]);
      }
    }

    const accountPattern = /[A-Za-z0-9_-]{5}/g;
    let match;
    while ((match = accountPattern.exec(cleanInput)) !== null) {
      const value = match[0];
      if (!seen.has(value)) {
        const allSame = value.split('').every(c => c === value[0]);
        if (!allSame) {
          results.push({ offset: match.index, value, length: 5, source: 'encoded' });
          seen.add(value);
        }
      }
    }
  }

  return results;
};

const fieldTypeNames: Record<number, string> = {
  0x0002: '字符串',
  0x0004: '32位整数',
  0x0008: '32位浮点',
  0x0001: '8位字节',
  0x0010: '16位整数',
  0x0020: '64位整数',
};

const fieldIdNames: Record<number, string> = {
  0x0044: '昵称/用户名',
  0x0045: '账户名',
  0x0046: '颜色',
  0x0047: '头像',
  0x0048: '状态',
  0x0049: '分数',
  0x004A: '位置',
  0x004B: '时间',
};

const VALID_TYPES = [0x0002, 0x0004, 0x0008, 0x0001, 0x0010, 0x0020];

const parseFields = (bytes: number[], version: number | null): { offset: number; fieldType: number; fieldId: number; value: string | number; length: number; description: string }[] => {
  const fields: { offset: number; fieldType: number; fieldId: number; value: string | number; length: number; description: string }[] = [];

  if (version === null || version < 20) {
    return fields;
  }

  return parseFieldsV20(bytes);
};

const mappings: Record<string, Array<{nickname: string; account: string}>> = {
  "1.txt": [
    {"nickname": "Bro Has Aura!!!", "account": "vm5Mb"},
    {"nickname": "[CN][卤牛牛]", "account": "_xeXm"},
    {"nickname": "团结起来 [CN]", "account": "KWN7u"},
    {"nickname": "Norge🇳🇴🤝🇸🇪🇵🇹", "account": "d3T0l"},
    {"nickname": "[CN]中国属广东", "account": "v2ULR"},
    {"nickname": "JAY--Z", "account": "tN59b"},
    {"nickname": "Player 118", "account": "bbnL9"},
    {"nickname": "[CORGI] the undefine", "account": "qb8tm"},
    {"nickname": "Player 873", "account": "b59tM"},
    {"nickname": "Player 570", "account": "RrQvt"},
    {"nickname": "Him", "account": "QBLBq"},
    {"nickname": "Big Lez show", "account": "vSg5-"},
    {"nickname": "zhxxxxxx", "account": "bQmrb"},
    {"nickname": "HELLO", "account": "Lt7Vv"}
  ],
  "2.txt": [
    {"nickname": "void67", "account": "5L5L2"},
    {"nickname": "PLiss***bro", "account": "neuNs"},
    {"nickname": "[BR]Gzinho", "account": "RTLr7"},
    {"nickname": "Crybaby Fuentes", "account": "MNqQL"},
    {"nickname": "Русь", "account": "bnmvr"},
    {"nickname": "[OG] Boooooo--/?", "account": "_v4Au"},
    {"nickname": "19🥷", "account": "Ex4Rd"},
    {"nickname": "Odioicalabbresi", "account": "7mB7b"},
    {"nickname": "Player 780", "account": "qMTmm"},
    {"nickname": "Giuseppe", "account": "5mN8N"},
    {"nickname": "[Corgi]Nate", "account": "5Vtvh"},
    {"nickname": "[VOID] H", "account": "FWMOW"},
    {"nickname": "Ottoman empire", "account": "qvnnt"},
    {"nickname": "🇨🇳🇹🇷[og]", "account": "apCcX"},
    {"nickname": "Stepan Bandera [UA]", "account": "7Q9Ao"},
    {"nickname": "William the Conq", "account": "JlDCd"},
    {"nickname": "SERKAN(Q7/🇹🇷⚫⚪", "account": "52Mq7"},
    {"nickname": "🇨🇳 团结起来 [CN] ☭", "account": "KWN7u"},
    {"nickname": "teddy", "account": "qNL28"},
    {"nickname": "[OG] raz", "account": "60ViE"},
    {"nickname": "[JP]Acrux", "account": "43WgB"},
    {"nickname": "[OG] MyaTheCat", "account": "Uqs03"},
    {"nickname": "Neutral🇨🇭", "account": "q9m52"},
    {"nickname": "Noima [Corgi]", "account": "0Iajw"},
    {"nickname": "nihi [void]", "account": "i6-NY"},
    {"nickname": "Player 305", "account": "NBNLQ"},
    {"nickname": "Sverige", "account": "qvLRR"},
    {"nickname": "[VOID] Redacted 8V", "account": "b9Q8V"},
    {"nickname": "67", "account": "QMTvv"},
    {"nickname": "MAMAGEN LOVER[c...", "account": "N72nn"},
    {"nickname": "Player 380", "account": "r5Rrm"},
    {"nickname": "Player 538", "account": "Ln9QN"},
    {"nickname": "🌪 OTTOMAN", "account": "q5RV9"},
    {"nickname": "GÖKTÜRK", "account": "7M7MN"},
    {"nickname": "Gypsystan", "account": "Tmnt2"},
    {"nickname": "[OG] nsiE", "account": "tUiBc"},
    {"nickname": "Aysn", "account": "NbTrt"},
    {"nickname": "Player 373", "account": "M9VLR"},
    {"nickname": "Player 636", "account": "Rq8vn"},
    {"nickname": "Player 245", "account": "vBbBn"},
    {"nickname": "[EU] 💥 Soundgarden", "account": "VnRqN"},
    {"nickname": "Zorro[UA]", "account": "nrNBr"},
    {"nickname": "aparicio67", "account": "RTqrn"},
    {"nickname": "[CN]中国共产党", "account": "WHzqZ"},
    {"nickname": "[OMEN] S", "account": "ObnHJ"},
    {"nickname": "[FR] Spassky", "account": "gIvHe"},
    {"nickname": "Player 147", "account": "2nn9m"},
    {"nickname": "PERNAMBUCO🥇💎", "account": "QvttL"},
    {"nickname": "🦅OSCAR", "account": "5mb25"},
    {"nickname": "[OG]WoW", "account": "nQt2r"},
    {"nickname": "Mephisto [CHAOS]", "account": "hYFE9"},
    {"nickname": "cat67", "account": "T7Rnv"},
  ]
};

// ============================================================
// 桥接函数：基于 replayCodec.ts 位级编解码器的结构化解析
// ============================================================

/** 游戏记录类型 */
export type GameRecordType = 'kingdom' | 'state' | 'player' | 'other';

/** 游戏记录（用于侧边栏显示） */
export interface GameRecord {
  name: string;
  offset: number;
  type: GameRecordType;
  account?: string | null;
  playerIndex?: number;
}

/** 字段 ID 常量（用于识别可编辑字段） */
const FIELD_ID_NICKNAME = 0x0044;
const FIELD_ID_ACCOUNT = 0x0045;
const FIELD_ID_VERSION = 0x0001;

/** 将字节数组转为可显示字符串，非可打印字符用转义序列表示 */
export function bytesToDisplayString(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x09) result += '\\t';
    else if (b === 0x0A) result += '\\n';
    else if (b === 0x0D) result += '\\r';
    else if (b === 0x5C) result += '\\\\';
    else if (b >= 0x20 && b <= 0x7E) result += String.fromCharCode(b);
    else result += '\\x' + b.toString(16).padStart(2, '0').toUpperCase();
  }
  return result;
}

function mapTypeName(t: number): string {
  switch (t) {
    case 0: return '程序生成';
    case 1: return '真实地图';
    case 2: return '图像地图';
    default: return `未知(${t})`;
  }
}

/** 解析 TT Playback 回放数据为结构化段
 * 使用 replayCodec.ts 的位级解码器，支持 v15-v22
 */
export function parseTTPlayback(bytes: number[], encodedInput: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  
  if (bytes.length === 0) {
    return segments;
  }

  const versionInfo = extractVersion(encodedInput);

  let replay: ReplayDataCodec;
  try {
    replay = decodeReplay(bytes);
  } catch (e) {
    segments.push({
      offset: 0,
      length: bytes.length,
      name: '原始数据',
      description: `解码失败: ${e instanceof Error ? e.message : String(e)}`,
      fields: [{
        offset: 0,
        length: bytes.length,
        name: '原始字节',
        type: 'bytes',
        value: bytes,
        description: '无法解码为回放结构',
        editable: false,
      }],
    });
    return segments;
  }

  // === 段1: 文件头 ===
  segments.push({
    offset: 0,
    length: 7,
    name: '文件头',
    description: `版本 ${replay.version} · 校验和 ${replay.checksum} · 字节数 ${replay.byteCount}`,
    fields: [
      { offset: 0, length: 12, name: '版本号', type: 'uint16', value: replay.version, description: `版本码: ${versionInfo.code}`, editable: true, fieldType: 0x0004, fieldId: FIELD_ID_VERSION },
      { offset: 12, length: 12, name: '校验和', type: 'uint16', value: replay.checksum, description: '12位累加校验和 (version + Σbytes[3..]) mod 4096', editable: false },
      { offset: 24, length: 31, name: '字节数', type: 'uint32', value: replay.byteCount, description: '数据字节数（含对齐字节）', editable: false },
    ],
  });

  // === 段2: 游戏设置 ===
  const s = replay.settings;
  segments.push({
    offset: 7,
    length: 0,
    name: '游戏设置',
    description: `${s.playerCount} 玩家 · ${s.humanCount} 人类 · ${mapTypeName(s.mapType)}`,
    fields: [
      { offset: 7, length: 2, name: '地图类型', type: 'uint8', value: s.mapType, description: mapTypeName(s.mapType), editable: false },
      { offset: 7, length: 8, name: '地图程序索引', type: 'uint8', value: s.mapProceduralIndex, description: '', editable: false },
      { offset: 7, length: 8, name: '地图真实索引', type: 'uint8', value: s.mapRealisticIndex, description: '', editable: false },
      { offset: 7, length: 14, name: '地图种子', type: 'uint16', value: s.mapSeed, description: '', editable: false },
      { offset: 7, length: 80, name: '地图名', type: 'utf16be', value: s.mapName, description: 'UTF-16BE 字符串', editable: false },
      { offset: 7, length: 10, name: '玩家数', type: 'uint16', value: s.playerCount, description: '总玩家数（含机器人）', editable: false },
      { offset: 7, length: 10, name: '人类数', type: 'uint16', value: s.humanCount, description: '人类玩家数', editable: false },
      { offset: 7, length: 9, name: '选中玩家', type: 'uint16', value: s.selectedPlayer, description: '回放视角玩家索引', editable: false },
      { offset: 7, length: 1, name: '游戏模式', type: 'uint8', value: s.gameMode, description: '', editable: false },
      { offset: 7, length: 1, name: '僵尸模式', type: 'uint8', value: s.isZombieMode, description: '', editable: false },
      { offset: 7, length: 1, name: '比赛模式', type: 'uint8', value: s.isContest, description: '', editable: false },
    ],
  });

  // === 段3..N: 玩家信息（昵称与账户名）===
  const players = extractPlayerInfo(replay);
  const humanCount = replay.settings.humanCount;
  let playerSegCount = 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const isHuman = i < humanCount;
    const playerType = isHuman ? '玩家' : 'Bot';

    const displayNickname = p.nickname || (isHuman ? null : `Bot ${i}`);

    const fields: ParsedField[] = [];
    if (displayNickname !== null) {
      fields.push({
        offset: 0,
        length: (p.nickname ? p.nickname.length : 0) * 16,
        name: '昵称',
        type: 'utf16be',
        value: displayNickname,
        description: isHuman ? 'UTF-16BE 编码的玩家昵称' : 'UTF-16BE 编码的机器人昵称',
        editable: true,
        fieldType: 0x0002,
        fieldId: FIELD_ID_NICKNAME,
        playerIndex: i,
      });
    }
    if (p.accountName !== null) {
      fields.push({
        offset: 0,
        length: 30,
        name: '账户名',
        type: 'string',
        value: p.accountName,
        description: '5字符 base64 账户名（v16+，30位哈希）',
        editable: true,
        fieldType: 0x0002,
        fieldId: FIELD_ID_ACCOUNT,
        playerIndex: i,
      });
    }

    if (fields.length === 0) continue;

    segments.push({
      offset: 0,
      length: 0,
      name: `${playerType} ${i}`,
      description: `${isHuman ? '人类' : '机器人'} · ${displayNickname || p.accountName || `#${i}`}`,
      fields,
      isGameRecord: true,
    });
    playerSegCount++;
  }

  // === 段N+1: 事件与帧标记 ===
  segments.push({
    offset: 0,
    length: 0,
    name: '事件与帧标记',
    description: `${replay.events.length} 事件 · ${replay.frameMarkers.length} 帧标记 · xQ=${replay.xQ}`,
    fields: [
      { offset: 0, length: 5, name: '动态位宽 xQ', type: 'uint8', value: replay.xQ, description: '帧长度的位宽', editable: false },
      { offset: 0, length: 30, name: '事件数', type: 'uint32', value: replay.events.length, description: '', editable: false },
      { offset: 0, length: 30, name: '帧标记数', type: 'uint32', value: replay.frameMarkers.length, description: '', editable: false },
    ],
  });

  return segments;
}

/** 查找游戏记录（玩家信息），用于侧边栏显示 */
export function findGameRecords(bytes: number[]): GameRecord[] {
  try {
    const replay = decodeReplay(bytes);
    const players = extractPlayerInfo(replay);
    const records: GameRecord[] = [];

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const name = p.nickname || p.accountName || `Player ${i}`;
      records.push({
        name,
        offset: i,
        type: 'player' as GameRecordType,
        account: p.accountName,
        playerIndex: i,
      });
    }

    return records;
  } catch {
    return [];
  }
}

/** 更新字段并重新编码
 * 根据字段的 fieldId 和 playerIndex 应用修改，然后重新编码整个回放
 * @returns 新的字节数组
 */
export function updateFieldInBytes(
  bytes: number[],
  field: ParsedField,
  newValue: ParsedField['value'],
): number[] {
  let replay: ReplayDataCodec;
  try {
    replay = decodeReplay(bytes);
  } catch {
    return bytes;
  }

  let modifiedReplay = replay;

  if (field.fieldId === FIELD_ID_NICKNAME && typeof newValue === 'string') {
    const playerIdx = field.playerIndex ?? 0;
    modifiedReplay = modifyNickname(replay, playerIdx, newValue);
  } else if (field.fieldId === FIELD_ID_ACCOUNT && typeof newValue === 'string') {
    const playerIdx = field.playerIndex ?? 0;
    modifiedReplay = modifyAccountName(replay, playerIdx, newValue);
  } else if (field.fieldId === FIELD_ID_VERSION && typeof newValue === 'number') {
    modifiedReplay = { ...replay, version: newValue };
  } else {
    return bytes;
  }

  try {
    return encodeReplay(modifiedReplay);
  } catch {
    return bytes;
  }
}