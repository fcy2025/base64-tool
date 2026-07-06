import { Header } from "./components/Header";
import { InputArea } from "./components/InputArea";
import { OutputArea } from "./components/OutputArea";
import { ControlPanel } from "./components/ControlPanel";
import { TableEditor } from "./components/TableEditor";
import { useBase64 } from "./hooks/useBase64";

export default function App() {
  const {
    inputText,
    outputText,
    outputBytes,
    operation,
    selectedTable,
    customTable,
    isCustom,
    isTTPlayback,
    error,
    viewMode,
    roundTripMatch,
    originalEncodedInput,
    hasChanges,
    setInputText,
    setOperation,
    setSelectedTable,
    setCustomTable,
    setIsCustom,
    setViewMode,
    copyToClipboard,
    swapInputOutput,
    updateOutputBytes,
    reEncodeFromBytes,
    restoreInitial,
  } = useBase64();

  const handleCustomToggle = () => {
    setIsCustom(!isCustom);
  };

  const handleTableReset = () => {
    setIsCustom(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative container mx-auto px-4 py-8 max-w-4xl">
        <Header />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800/50 rounded-2xl p-6 shadow-xl">
              <InputArea
                value={inputText}
                onChange={setInputText}
                placeholder={operation === 'encode' ? '输入要编码的文本...' : '输入要解码的Base64文本...'}
                hasChanges={hasChanges}
                onRestore={restoreInitial}
              />
            </div>

            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800/50 rounded-2xl p-6 shadow-xl">
              <OutputArea
                value={outputText}
                bytes={outputBytes}
                error={error}
                viewMode={viewMode}
                onCopy={copyToClipboard}
                onSwap={swapInputOutput}
                onViewModeChange={setViewMode}
                onUpdateBytes={updateOutputBytes}
                onReEncode={reEncodeFromBytes}
                isDecodeMode={operation === 'decode'}
                roundTripMatch={roundTripMatch}
                originalEncodedInput={originalEncodedInput}
                reEncodedInput={inputText}
                inputText={inputText}
                isTTPlayback={isTTPlayback}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800/50 rounded-2xl p-6 shadow-xl">
              <ControlPanel
                operation={operation}
                selectedTable={selectedTable}
                isCustom={isCustom}
                onOperationChange={setOperation}
                onTableSelect={(name) => {
                  setSelectedTable(name);
                  setIsCustom(false);
                }}
                onCustomToggle={handleCustomToggle}
              />
            </div>

            {isCustom && (
              <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800/50 rounded-2xl p-6 shadow-xl">
                <TableEditor
                  value={customTable}
                  onChange={setCustomTable}
                  onReset={handleTableReset}
                />
              </div>
            )}

            <div className="bg-gray-900/30 border border-gray-800/30 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">使用说明</h3>
              <ul className="space-y-2 text-xs text-gray-500">
                <li>• 选择编码或解码模式</li>
                <li>• 选择预设编码表或自定义</li>
                <li>• 输入文本后自动处理</li>
                <li>• 点击复制按钮复制结果</li>
                <li>• 解码后可切换十六进制视图编辑原始字节</li>
                <li>• 编辑后点击重新编码按钮生成新的编码结果</li>
                <li>• 点击还原按钮可恢复到初始输入</li>
              </ul>
            </div>
          </div>
        </div>

        <footer className="mt-12 text-center text-xs text-gray-600">
          <p>Base64 Tool - 支持自定义编码表 | TT Playback解析器</p>
        </footer>
      </div>
    </div>
  );
}
