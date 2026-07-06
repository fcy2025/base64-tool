import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { PRESET_TABLES } from '../utils/tables';

interface TableSelectorProps {
  selectedTable: string;
  isCustom: boolean;
  onSelect: (name: string) => void;
  onCustomToggle: () => void;
}

export const TableSelector = ({ selectedTable, isCustom, onSelect, onCustomToggle }: TableSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (name: string) => {
    onSelect(name);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl hover:border-indigo-500/50 transition-all text-left group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isCustom ? 'bg-amber-500' : 'bg-indigo-500'}`} />
          <span className="text-sm font-medium text-gray-200">
            {isCustom ? '自定义编码表' : selectedTable}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900/95 backdrop-blur-lg border border-gray-700/50 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="max-h-60 overflow-y-auto">
            {PRESET_TABLES.map((table) => (
              <button
                key={table.name}
                onClick={() => handleSelect(table.name)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors ${!isCustom && selectedTable === table.name ? 'bg-indigo-500/10' : ''}`}
              >
                {!isCustom && selectedTable === table.name && (
                  <Check className="w-4 h-4 text-indigo-400" />
                )}
                {isCustom || selectedTable !== table.name && (
                  <div className="w-3 h-3 rounded-full bg-gray-600" />
                )}
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-200">{table.name}</div>
                  <div className="text-xs text-gray-500">{table.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-700/50">
            <button
              onClick={() => {
                onCustomToggle();
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors ${isCustom ? 'bg-amber-500/10' : ''}`}
            >
              {isCustom && <Check className="w-4 h-4 text-amber-400" />}
              {!isCustom && <div className="w-3 h-3 rounded-full bg-gray-600" />}
              <div className="text-left">
                <div className="text-sm font-medium text-gray-200">自定义编码表</div>
                <div className="text-xs text-gray-500">输入自己的64字符编码表</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};