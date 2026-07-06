export const Header = () => {
  return (
    <header className="text-center mb-8">
      <div className="inline-flex items-center gap-3 mb-2">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500 flex items-center justify-center transform hover:rotate-6 transition-transform duration-300 shadow-lg">
            <svg viewBox="0 0 100 100" className="w-6 h-6 text-white" xmlns="http://www.w3.org/2000/svg">
              <g fill="currentColor">
                <rect x="18" y="22" width="10" height="8" rx="2"/>
                <rect x="32" y="22" width="10" height="8" rx="2"/>
                <rect x="46" y="22" width="10" height="8" rx="2"/>
                <rect x="60" y="22" width="10" height="8" rx="2"/>
                <rect x="74" y="22" width="10" height="8" rx="2"/>
                <rect x="18" y="36" width="10" height="8" rx="2"/>
                <rect x="32" y="36" width="10" height="8" rx="2"/>
                <rect x="46" y="36" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="60" y="36" width="10" height="8" rx="2"/>
                <rect x="74" y="36" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="18" y="50" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="32" y="50" width="10" height="8" rx="2"/>
                <rect x="46" y="50" width="10" height="8" rx="2"/>
                <rect x="60" y="50" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="74" y="50" width="10" height="8" rx="2"/>
                <rect x="18" y="64" width="10" height="8" rx="2"/>
                <rect x="32" y="64" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="46" y="64" width="10" height="8" rx="2" fill="transparent"/>
                <rect x="60" y="64" width="10" height="8" rx="2"/>
                <rect x="74" y="64" width="10" height="8" rx="2"/>
              </g>
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500 flex items-center justify-center transform rotate-12 opacity-30 blur-sm" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Base64 Tool
        </h1>
      </div>
      <p className="text-gray-400 text-sm">
        支持自定义编码表的现代化Base64编解码工具
      </p>
    </header>
  );
};