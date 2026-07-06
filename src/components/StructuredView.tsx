import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Search, Edit2, Save, X, Crown, Building2, User, HelpCircle } from 'lucide-react';
import type { ParsedSegment, ParsedField } from '../utils/ttPlaybackParser';
import { findGameRecords, updateFieldInBytes } from '../utils/ttPlaybackParser';

interface StructuredViewProps {
  segments: ParsedSegment[];
  bytes: number[];
  onBytesUpdate: (bytes: number[]) => void;
}

const formatValue = (value: ParsedField['value']): string => {
  if (Array.isArray(value)) {
    return value.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value);
};

const parseValue = (str: string, type: ParsedField['type']): ParsedField['value'] => {
  switch (type) {
    case 'uint8':
    case 'uint16':
    case 'uint32':
      return parseInt(str, 10) || 0;
    case 'int8':
    case 'int16':
    case 'int32':
      return parseInt(str, 10) || 0;
    case 'float32':
      return parseFloat(str) || 0;
    case 'bytes': {
      const cleaned = str.replace(/[^0-9A-Fa-f]/g, '');
      const bytes: number[] = [];
      for (let i = 0; i < cleaned.length; i += 2) {
        const byte = parseInt(cleaned.substring(i, i + 2), 16);
        if (!isNaN(byte)) bytes.push(byte);
      }
      return bytes;
    }
    case 'utf16be':
    default:
      return str;
  }
};

const getTypeIcon = (type: 'kingdom' | 'state' | 'player' | 'other') => {
  switch (type) {
    case 'kingdom': return <Crown className="w-4 h-4 text-yellow-400" />;
    case 'state': return <Building2 className="w-4 h-4 text-blue-400" />;
    case 'player': return <User className="w-4 h-4 text-green-400" />;
    default: return <HelpCircle className="w-4 h-4 text-gray-400" />;
  }
};

const getTypeName = (type: 'kingdom' | 'state' | 'player' | 'other') => {
  switch (type) {
    case 'kingdom': return '王国';
    case 'state': return '国家';
    case 'player': return '玩家';
    default: return '其他';
  }
};

export const StructuredView = ({ segments, bytes, onBytesUpdate }: StructuredViewProps) => {
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set([0]));
  const [searchQuery, setSearchQuery] = useState('');
  const [editingField, setEditingField] = useState<{ segmentIdx: number; fieldIdx: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const gameRecords = useMemo(() => findGameRecords(bytes), [bytes]);

  const toggleSegment = (index: number) => {
    setExpandedSegments(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const filteredSegments = segments.filter(seg => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      seg.name.toLowerCase().includes(q) ||
      seg.description.toLowerCase().includes(q) ||
      seg.fields.some(f => 
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        formatValue(f.value).toLowerCase().includes(q)
      )
    );
  });

  const handleFieldEdit = (segmentIdx: number, fieldIdx: number) => {
    const field = segments[segmentIdx].fields[fieldIdx];
    setEditingField({ segmentIdx, fieldIdx });
    setEditValue(formatValue(field.value));
  };

  const handleFieldSave = (segmentIdx: number, fieldIdx: number) => {
    const field = segments[segmentIdx].fields[fieldIdx];
    const newValue = parseValue(editValue, field.type);
    
    const newBytes = updateFieldInBytes(bytes, field, newValue);
    
    onBytesUpdate(newBytes);
    setEditingField(null);
    setEditValue('');
  };

  const getFieldTypeColor = (type: ParsedField['type']): string => {
    switch (type) {
      case 'uint8':
      case 'uint16':
      case 'uint32':
        return 'text-cyan-400';
      case 'int8':
      case 'int16':
      case 'int32':
        return 'text-blue-400';
      case 'float32':
        return 'text-amber-400';
      case 'string':
      case 'utf16be':
        return 'text-green-400';
      case 'bytes':
        return 'text-purple-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="搜索字段名称、值或描述..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-900/80 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            未找到匹配的字段
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isExpanded = expandedSegments.has(idx);
            const segIndex = segments.indexOf(seg);
            
            return (
              <div
                key={idx}
                className={`bg-gray-800/30 border rounded-lg overflow-hidden ${
                  seg.isGameRecord ? 'border-indigo-500/30' : 'border-gray-700/30'
                }`}
              >
                <button
                  onClick={() => toggleSegment(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left ${
                    seg.isGameRecord ? 'bg-indigo-500/10' : ''
                  }`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-xs text-gray-500 font-mono">0x{seg.offset.toString(16).padStart(4, '0')}</span>
                  <span className={`font-medium ${seg.isGameRecord ? 'text-indigo-200' : 'text-gray-200'}`}>
                    {seg.name}
                  </span>
                  <span className="text-xs text-gray-500">{seg.length} 字节</span>
                  <span className="text-xs text-gray-600 ml-auto">{seg.description}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {seg.fields.map((field, fieldIdx) => (
                      <div
                        key={fieldIdx}
                        className={`flex items-center gap-3 py-2 px-3 rounded-md ${
                          editingField?.segmentIdx === segIndex && editingField?.fieldIdx === fieldIdx
                            ? 'bg-indigo-500/20'
                            : 'hover:bg-gray-700/30'
                        }`}
                      >
                        <span className="text-xs text-gray-600 font-mono w-14">0x{field.offset.toString(16).padStart(3, '0')}</span>
                        <span className={`text-xs font-mono w-14 ${getFieldTypeColor(field.type)}`}>
                          {field.type}
                        </span>
                        <span className="text-sm text-gray-300 w-24 truncate">{field.name}</span>
                        
                        {editingField?.segmentIdx === segIndex && editingField?.fieldIdx === fieldIdx ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="flex-1 px-2 py-1 bg-gray-900/80 border border-indigo-500/50 rounded text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleFieldSave(segIndex, fieldIdx)}
                              className="p-1 rounded hover:bg-green-500/20 text-green-400"
                              title="保存"
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingField(null)}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                              title="取消"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-gray-400 font-mono truncate">
                              {formatValue(field.value)}
                            </span>
                            {field.editable && (
                              <button
                                onClick={() => handleFieldEdit(segIndex, fieldIdx)}
                                className="p-1 rounded hover:bg-indigo-500/20 text-gray-500 hover:text-indigo-400"
                                title="编辑"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="text-xs text-gray-500 text-center">
        共 {segments.length} 个段，{segments.reduce((acc, seg) => acc + seg.fields.length, 0)} 个字段
      </div>
    </div>
  );
};
