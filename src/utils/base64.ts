import { DEFAULT_PADDING, validateTable } from './tables';

export interface DecodeResult {
  bytes: number[];
  paddingChar: string | null;
}

export class Base64 {
  private readonly table: string;
  private readonly padding: string;
  private readonly charMap: Map<string, number>;

  constructor(table: string, padding: string = DEFAULT_PADDING) {
    const validation = validateTable(table);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    this.table = table;
    this.padding = padding;
    this.charMap = new Map();
    for (let i = 0; i < table.length; i++) {
      this.charMap.set(table[i], i);
    }
  }

  encode(input: string): string {
    if (!input) return '';
    const bytes = this.stringToBytes(input);
    return this.encodeFromBytes(bytes);
  }

  encodeFromBytes(bytes: number[], originalCharCount?: number): string {
    if (!bytes || bytes.length === 0) return '';
    
    const result: string[] = [];
    
    for (let i = 0; i < bytes.length; i += 3) {
      const byte1 = bytes[i];
      const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;

      const group = (byte1 << 16) | (byte2 << 8) | byte3;

      result.push(this.table[(group >> 18) & 0x3F]);
      result.push(this.table[(group >> 12) & 0x3F]);
      
      if (i + 1 < bytes.length) {
        result.push(this.table[(group >> 6) & 0x3F]);
      } else {
        result.push(this.padding);
      }
      
      if (i + 2 < bytes.length) {
        result.push(this.table[group & 0x3F]);
      } else {
        result.push(this.padding);
      }
    }

    if (originalCharCount !== undefined && result.length < originalCharCount) {
      const neededChars = originalCharCount - result.length;
      for (let i = 0; i < neededChars; i++) {
        result.push(this.table[0]);
      }
    }

    return result.join('');
  }

  decode(input: string): string {
    if (!input) return '';
    const bytes = this.decodeToBytes(input);
    return this.bytesToString(bytes);
  }

  decodeToBytes(input: string): number[] {
    return this.decodeWithPadding(input).bytes;
  }

  decodeWithPadding(input: string): DecodeResult {
    if (!input) return { bytes: [], paddingChar: null };

    let cleanInput = input.replace(/\s/g, '');
    
    if (cleanInput.startsWith('https://')) {
      const replayMatch = cleanInput.match(/replay=([^&]+)/);
      if (replayMatch) {
        cleanInput = decodeURIComponent(replayMatch[1]);
      }
    }
    
    if (cleanInput.length === 0) return { bytes: [], paddingChar: null };

    const charIndices: number[] = [];
    let paddingChar: string | null = null;
    
    for (let i = 0; i < cleanInput.length; i++) {
      const char = cleanInput[i];
      const idx = this.charMap.get(char);
      if (idx === undefined) continue;
      charIndices.push(idx);
    }

    const bytes: number[] = [];
    
    for (let i = 0; i < charIndices.length; i += 4) {
      const idx1 = charIndices[i];
      const idx2 = i + 1 < charIndices.length ? charIndices[i + 1] : 0;
      const idx3 = i + 2 < charIndices.length ? charIndices[i + 2] : 0;
      const idx4 = i + 3 < charIndices.length ? charIndices[i + 3] : 0;

      const group = (idx1 << 18) | (idx2 << 12) | (idx3 << 6) | idx4;

      bytes.push((group >> 16) & 0xFF);
      bytes.push((group >> 8) & 0xFF);
      bytes.push(group & 0xFF);
    }

    const expectedByteCount = Math.floor(charIndices.length * 6 / 8);
    
    if (cleanInput.length > charIndices.length) {
      const extraChars = cleanInput.length - charIndices.length;
      if (extraChars > 0) {
        paddingChar = cleanInput[cleanInput.length - extraChars];
      }
    }

    return { 
      bytes: bytes.slice(0, expectedByteCount), 
      paddingChar 
    };
  }

  private stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode < 0x80) {
        bytes.push(charCode);
      } else if (charCode < 0x800) {
        bytes.push(0xC0 | (charCode >> 6));
        bytes.push(0x80 | (charCode & 0x3F));
      } else if (charCode < 0x10000) {
        bytes.push(0xE0 | (charCode >> 12));
        bytes.push(0x80 | ((charCode >> 6) & 0x3F));
        bytes.push(0x80 | (charCode & 0x3F));
      } else {
        bytes.push(0xF0 | (charCode >> 18));
        bytes.push(0x80 | ((charCode >> 12) & 0x3F));
        bytes.push(0x80 | ((charCode >> 6) & 0x3F));
        bytes.push(0x80 | (charCode & 0x3F));
      }
    }
    return bytes;
  }

  bytesToString(bytes: number[]): string {
    let result = '';
    let i = 0;
    while (i < bytes.length) {
      const byte1 = bytes[i++];
      if (byte1 < 0x80) {
        result += String.fromCharCode(byte1);
      } else if (byte1 >= 0xC0 && byte1 < 0xE0 && i < bytes.length) {
        const byte2 = bytes[i++];
        result += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
      } else if (byte1 >= 0xE0 && byte1 < 0xF0 && i + 1 < bytes.length) {
        const byte2 = bytes[i++];
        const byte3 = bytes[i++];
        result += String.fromCharCode(((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F));
      } else if (byte1 >= 0xF0 && byte1 < 0xF8 && i + 2 < bytes.length) {
        const byte2 = bytes[i++];
        const byte3 = bytes[i++];
        const byte4 = bytes[i++];
        const charCode = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        result += String.fromCharCode(charCode);
      } else {
        result += String.fromCharCode(0xFFFD);
      }
    }
    return result;
  }
}
