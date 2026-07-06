import { useState } from 'react';
import { FileText, Trash2, RotateCcw } from 'lucide-react';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hasChanges?: boolean;
  onRestore?: () => void;
}

export const InputArea = ({ value, onChange, placeholder, hasChanges, onRestore }: InputAreaProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-gray-300">输入</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{value.length} 字符</span>
          {hasChanges && onRestore && (
            <button
              onClick={onRestore}
              className="p-1.5 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-cyan-400"
              title="还原到初始输入"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {value && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-red-400"
              title="清空"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div
        className={`relative rounded-xl overflow-hidden transition-all duration-300 ${
          isFocused ? 'ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/10' : ''
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-gray-900/50" />
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="relative w-full h-40 p-4 bg-gray-900/80 backdrop-blur-md border border-gray-700/50 rounded-xl text-gray-200 placeholder-gray-500 resize-none focus:outline-none font-mono text-sm leading-relaxed"
        />
      </div>
    </div>
  );
};