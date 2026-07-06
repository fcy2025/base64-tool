import { useState } from 'react';
import { Settings, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';
import { validateTable, PRESET_TABLES } from '../utils/tables';

interface TableEditorProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}

export const TableEditor = ({ value, onChange, onReset }: TableEditorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const validation = validateTable(value);

  const handleReset = () => {
    onChange(PRESET_TABLES[0].characters);
    onReset();
  };

  return (
    <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-gray-200">自定义编码表</span>
          {value && (
            validation.valid ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
          validation.valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {value.length}/64
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="输入64个唯一字符作为编码表..."
            className="w-full h-24 p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50 font-mono text-sm"
          />
          
          {!validation.valid && value && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              {validation.message}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              重置为默认
            </button>
          </div>
        </div>
      )}
    </div>
  );
};