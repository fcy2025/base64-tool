import { useState, useCallback, useEffect } from 'react';
import { Base64, DecodeResult } from '../utils/base64';
import { PRESET_TABLES, validateTable, getTableByName } from '../utils/tables';
import { base64ToBytes, replayBytesToBase64 } from '../utils/replayCodec';

export type Operation = 'encode' | 'decode';
export type ViewMode = 'text' | 'hex' | 'structured';

export interface UseBase64Return {
  inputText: string;
  outputText: string;
  outputBytes: number[];
  operation: Operation;
  selectedTable: string;
  customTable: string;
  isCustom: boolean;
  isTTPlayback: boolean;
  error: string | null;
  viewMode: ViewMode;
  initialInput: string;
  hasChanges: boolean;
  setInputText: (text: string) => void;
  setOperation: (op: Operation) => void;
  setSelectedTable: (name: string) => void;
  setCustomTable: (table: string) => void;
  setIsCustom: (custom: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  copyToClipboard: () => Promise<void>;
  copyInputToClipboard: () => Promise<void>;
  swapInputOutput: () => void;
  updateOutputBytes: (bytes: number[]) => void;
  restoreInitial: () => void;
}

export const useBase64 = (): UseBase64Return => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [outputBytes, setOutputBytes] = useState<number[]>([]);
  const [paddingChar, setPaddingChar] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>('decode');
  const [selectedTable, setSelectedTable] = useState('TT Playback');
  const [customTable, setCustomTable] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('structured');
  const [initialInput, setInitialInput] = useState('');
  const [hasSetInitial, setHasSetInitial] = useState(false);

  const getCurrentTable = useCallback((): string => {
    if (isCustom && customTable && validateTable(customTable).valid) {
      return customTable;
    }
    const table = getTableByName(selectedTable);
    return table?.characters || PRESET_TABLES[0].characters;
  }, [isCustom, customTable, selectedTable]);

  const isTTPlayback = useCallback((): boolean => {
    return !isCustom && selectedTable === 'TT Playback';
  }, [isCustom, selectedTable]);

  useEffect(() => {
    if (!isTTPlayback()) {
      setViewMode('text');
    } else {
      setViewMode('structured');
      setOperation('decode');
    }
  }, [isTTPlayback]);

  const hasChanges = useCallback(() => {
    return inputText !== initialInput && initialInput !== '';
  }, [inputText, initialInput]);

  useEffect(() => {
    setError(null);
    if (!inputText.trim()) {
      setOutputText('');
      setOutputBytes([]);
      setPaddingChar(null);
      return;
    }

    let cleanInput = inputText.trim().replace(/\s/g, '');
    
    if (cleanInput.startsWith('https://')) {
      const replayMatch = cleanInput.match(/replay=([^&]+)/);
      if (replayMatch) {
        cleanInput = decodeURIComponent(replayMatch[1]);
      }
    }

    try {
      const currentTable = getCurrentTable();
      const base64 = new Base64(currentTable);

      if (operation === 'encode') {
        const result = base64.encode(cleanInput);
        setOutputText(result);
        setOutputBytes([]);
        setPaddingChar(null);
      } else {
        if (isTTPlayback()) {
          const ttBytes = base64ToBytes(cleanInput);
          setOutputBytes(ttBytes);
          setPaddingChar(null);
          setOutputText(base64.bytesToString(ttBytes));
        } else {
          const decodeResult: DecodeResult = base64.decodeWithPadding(cleanInput);
          setOutputBytes(decodeResult.bytes);
          setPaddingChar(decodeResult.paddingChar);
          const text = base64.bytesToString(decodeResult.bytes);
          setOutputText(text);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '处理失败';
      setError(message);
      setOutputText('');
      setOutputBytes([]);
      setPaddingChar(null);
    }
  }, [inputText, operation, getCurrentTable, isTTPlayback]);

  useEffect(() => {
    if (inputText.trim() && !hasSetInitial) {
      setInitialInput(inputText);
      setHasSetInitial(true);
    }
  }, [inputText]);

  const copyToClipboard = useCallback(async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = outputText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, [outputText]);

  const copyInputToClipboard = useCallback(async () => {
    if (!inputText) return;
    try {
      await navigator.clipboard.writeText(inputText);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = inputText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, [inputText]);

  const swapInputOutput = useCallback(() => {
    if (outputText) {
      setInputText(outputText);
      setHasSetInitial(false);
    }
  }, [outputText]);

  const updateOutputBytes = useCallback((bytes: number[]) => {
    setOutputBytes(bytes);
    const base64 = new Base64(getCurrentTable());
    setOutputText(base64.bytesToString(bytes));
    
    if (operation === 'decode') {
      let cleanInput = inputText.replace(/\s/g, '');
      if (cleanInput.startsWith('https://')) {
        const replayMatch = cleanInput.match(/replay=([^&]+)/);
        if (replayMatch) {
          cleanInput = decodeURIComponent(replayMatch[1]);
        }
      }

      let encoded: string;
      if (isTTPlayback()) {
        encoded = replayBytesToBase64(bytes);
      } else {
        encoded = base64.encodeFromBytes(bytes, cleanInput.length);
        if (paddingChar && encoded.length === cleanInput.length) {
          const resultArray = encoded.split('');
          resultArray[resultArray.length - 1] = paddingChar;
          encoded = resultArray.join('');
        }
      }

      setInputText(encoded);
      setHasSetInitial(false);
    }
  }, [getCurrentTable, operation, inputText, isTTPlayback, paddingChar]);

  const restoreInitial = useCallback(() => {
    if (initialInput) {
      setInputText(initialInput);
      setHasSetInitial(false);
    }
  }, [initialInput]);

  return {
    inputText,
    outputText,
    outputBytes,
    operation,
    selectedTable,
    customTable,
    isCustom,
    isTTPlayback: isTTPlayback(),
    error,
    viewMode,
    initialInput,
    hasChanges: hasChanges(),
    setInputText,
    setOperation,
    setSelectedTable,
    setCustomTable,
    setIsCustom,
    setViewMode,
    copyToClipboard,
    copyInputToClipboard,
    swapInputOutput,
    updateOutputBytes,
    restoreInitial,
  };
}

export { validateTable };
