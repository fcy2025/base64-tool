export interface CharTable {
  name: string;
  characters: string;
  description: string;
}

export const PRESET_TABLES: CharTable[] = [
  {
    name: 'Default',
    characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    description: '标准Base64编码表',
  },
  {
    name: 'TT Playback',
    characters: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
    description: 'TT回放编码表',
  },
  {
    name: 'URL-Safe',
    characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
    description: 'URL安全编码表(RFC 4648)',
  },
  {
    name: 'Hex64',
    characters: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/',
    description: '十六进制优先编码表',
  },
  {
    name: 'Base64url',
    characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
    description: 'Base64url编码表(RFC 4648)',
  },
];

export const DEFAULT_PADDING = '=';

export const validateTable = (table: string): { valid: boolean; message: string } => {
  if (table.length !== 64) {
    return { valid: false, message: `编码表必须包含64个字符，当前长度: ${table.length}` };
  }
  
  const uniqueChars = new Set(table);
  if (uniqueChars.size !== 64) {
    return { valid: false, message: '编码表中存在重复字符' };
  }
  
  return { valid: true, message: '' };
};

export const getTableByName = (name: string): CharTable | undefined => {
  return PRESET_TABLES.find((t) => t.name === name);
};