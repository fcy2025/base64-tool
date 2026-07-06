import { ArrowUpCircle, ArrowDownCircle, Code2 } from 'lucide-react';
import type { Operation } from '../hooks/useBase64';
import { TableSelector } from './TableSelector';

interface ControlPanelProps {
  operation: Operation;
  selectedTable: string;
  isCustom: boolean;
  onOperationChange: (op: Operation) => void;
  onTableSelect: (name: string) => void;
  onCustomToggle: () => void;
}

export const ControlPanel = ({
  operation,
  selectedTable,
  isCustom,
  onOperationChange,
  onTableSelect,
  onCustomToggle,
}: ControlPanelProps) => {
  const isTTPlayback = !isCustom && selectedTable === 'TT Playback';

  return (
    <div className="flex flex-col gap-4">
      {isTTPlayback ? (
        <button
          onClick={() => onOperationChange('decode')}
          className="relative w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/30"
        >
          <Code2 className="w-4 h-4" />
          解析与编辑
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOperationChange('encode')}
            className={`relative flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
              operation === 'encode'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 transform translate-y-0'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transform translate-y-0.5'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            编码
          </button>
          <button
            onClick={() => onOperationChange('decode')}
            className={`relative flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
              operation === 'decode'
                ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-500/30 transform translate-y-0'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transform translate-y-0.5'
            }`}
          >
            <ArrowDownCircle className="w-4 h-4" />
            解码
          </button>
        </div>
      )}

      <TableSelector
        selectedTable={selectedTable}
        isCustom={isCustom}
        onSelect={onTableSelect}
        onCustomToggle={onCustomToggle}
      />
    </div>
  );
};