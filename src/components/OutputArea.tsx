import { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, Check, ArrowRightLeft, Hexagon, FileText, RefreshCw, Database } from 'lucide-react';
import type { ViewMode } from '../hooks/useBase64';
import { StructuredView } from './StructuredView';
import { parseTTPlayback, bytesToDisplayString } from '../utils/ttPlaybackParser';

interface OutputAreaProps {
  value: string;
  bytes: number[];
  error: string | null;
  viewMode: ViewMode;
  onCopy: () => Promise<void>;
  onSwap: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onUpdateBytes: (bytes: number[]) => void;
  onReEncode: () => void;
  isDecodeMode: boolean;
  roundTripMatch: boolean | null;
  originalEncodedInput: string;
  reEncodedInput: string;
  inputText: string;
  isTTPlayback: boolean;
}

const bytesToHexString = (bytes: number[]): string => {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

const hexStringToBytes = (hex: string): number[] => {
  const cleaned = hex.replace(/[^0-9A-Fa-f]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const byte = parseInt(cleaned.substring(i, i + 2), 16);
    if (!isNaN(byte)) {
      bytes.push(byte);
    }
  }
  return bytes;
};

const escapeNonPrintable = (str: string): string => {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x00) result += '\\0';
    else if (code === 0x07) result += '\\a';
    else if (code === 0x08) result += '\\b';
    else if (code === 0x09) result += '\\t';
    else if (code === 0x0A) result += '\\n';
    else if (code === 0x0B) result += '\\v';
    else if (code === 0x0C) result += '\\f';
    else if (code === 0x0D) result += '\\r';
    else if (code === 0x1B) result += '\\e';
    else if (code >= 0x20 && code <= 0x7E) result += str[i];
    else if (code <= 0xFF) result += `\\x${code.toString(16).padStart(2, '0').toUpperCase()}`;
    else if (code <= 0xFFFF) result += `\\u${code.toString(16).padStart(4, '0').toUpperCase()}`;
    else result += `\\U${code.toString(16).padStart(8, '0').toUpperCase()}`;
  }
  return result;
};

export const OutputArea = ({
  value,
  bytes,
  error,
  viewMode,
  onCopy,
  onSwap,
  onViewModeChange,
  onUpdateBytes,
  onReEncode,
  isDecodeMode,
  roundTripMatch,
  originalEncodedInput,
  reEncodedInput,
  inputText,
  isTTPlayback,
}: OutputAreaProps) => {
  const [copied, setCopied] = useState(false);
  const [hexValue, setHexValue] = useState('');
  
  const segments = useMemo(() => {
    if (viewMode !== 'structured' || bytes.length === 0) {
      return [];
    }
    return parseTTPlayback(bytes, inputText);
  }, [bytes, inputText, viewMode]);

  useEffect(() => {
    if (viewMode === 'hex') {
      setHexValue(bytesToHexString(bytes));
    }
  }, [bytes, viewMode]);

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHexValue(e.target.value);
    const newBytes = hexStringToBytes(e.target.value);
    onUpdateBytes(newBytes);
  };

  const handleReEncode = useCallback(() => {
    onReEncode();
  }, [onReEncode]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {error ? (
            <>
              <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-400">错误</span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-300">输出</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {error ? 0 : viewMode === 'hex' ? `${bytes.length} 字节` : `${value.length} 字符`}
          </span>
          {isDecodeMode && !error && bytes.length > 0 && (
            <>
              <div className="flex items-center rounded-lg overflow-hidden border border-gray-700/50">
                <button
                  onClick={() => onViewModeChange('text')}
                  className={`px-3 py-1.5 text-xs font-medium transition-all ${
                    viewMode === 'text'
                      ? 'bg-indigo-600/50 text-indigo-200'
                      : 'bg-gray-800/30 text-gray-400 hover:text-gray-200'
                  }`}
                  title="文本视图"
                >
                  <FileText className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onViewModeChange('hex')}
                  className={`px-3 py-1.5 text-xs font-medium transition-all ${
                    viewMode === 'hex'
                      ? 'bg-indigo-600/50 text-indigo-200'
                      : 'bg-gray-800/30 text-gray-400 hover:text-gray-200'
                  }`}
                  title="十六进制视图"
                >
                  <Hexagon className="w-3 h-3" />
                </button>
                {isTTPlayback && (
                  <button
                    onClick={() => onViewModeChange('structured')}
                    className={`px-3 py-1.5 text-xs font-medium transition-all ${
                      viewMode === 'structured'
                        ? 'bg-indigo-600/50 text-indigo-200'
                        : 'bg-gray-800/30 text-gray-400 hover:text-gray-200'
                    }`}
                    title="结构化视图"
                  >
                    <Database className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={handleReEncode}
                className="p-1.5 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-amber-400"
                title="重新编码"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}
          {value && !error && (
            <>
              <button
                onClick={onSwap}
                className="p-1.5 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-indigo-400"
                title="交换到输入"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded-lg transition-all ${
                  copied
                    ? 'bg-green-500/20 text-green-400'
                    : 'hover:bg-gray-800/50 text-gray-400 hover:text-indigo-400'
                }`}
                title="复制"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>
      <div
        className={`relative rounded-xl overflow-hidden transition-all duration-300 ${
          error ? 'ring-2 ring-red-500/30' : 'ring-2 ring-green-500/30'
        }`}
      >
        <div className={`absolute inset-0 ${error ? 'bg-gradient-to-br from-red-900/20 to-gray-900/50' : 'bg-gradient-to-br from-green-900/20 to-gray-900/50'}`} />
        
        {viewMode === 'structured' && !error ? (
          <div className="relative p-4 bg-gray-900/80 backdrop-blur-md border border-green-700/50 rounded-xl">
            <StructuredView 
              segments={segments} 
              bytes={bytes}
              onBytesUpdate={onUpdateBytes}
            />
          </div>
        ) : (
          <textarea
            value={error || (viewMode === 'hex' ? hexValue : (viewMode === 'text' ? value : bytesToDisplayString(bytes)))}
            onChange={viewMode === 'hex' ? handleHexChange : undefined}
            readOnly={viewMode !== 'hex' || error !== null}
            className={`relative w-full h-64 p-4 bg-gray-900/80 backdrop-blur-md border ${error ? 'border-red-700/50' : 'border-green-700/50'} rounded-xl ${error ? 'text-red-300' : 'text-gray-200'} resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono text-sm leading-relaxed ${viewMode === 'hex' && !error ? 'cursor-text' : 'cursor-default'}`}
            placeholder={viewMode === 'hex' ? '输入十六进制数据...' : ''}
          />
        )}
      </div>
      {isDecodeMode && !error && bytes.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>提示: 切换到十六进制视图可查看和编辑原始字节</span>
            <span>{((bytes.filter(b => b >= 0x20 && b <= 0x7E).length / bytes.length) * 100).toFixed(1)}% 可打印字符</span>
          </div>
          {roundTripMatch !== null && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              roundTripMatch 
                ? 'bg-green-500/20 border border-green-500/30' 
                : 'bg-amber-500/20 border border-amber-500/30'
            }`}>
              {roundTripMatch ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400">编码往返匹配 ✓</span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">!</div>
                  <span className="text-xs text-amber-400">编码往返不匹配</span>
                  <span className="text-xs text-amber-300/70">
                    原始: {originalEncodedInput.length} 字符 | 重新编码: {reEncodedInput.length} 字符
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};