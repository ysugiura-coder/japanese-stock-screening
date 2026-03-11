'use client';

export default function TakapiPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">たかぴー情報まとめ</h1>
          <p className="text-gray-600">
            X（Twitter）のたかぴーさん（<a href="https://twitter.com/stock_unknown" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@stock_unknown</a>）の情報をまとめています
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 注目銘柄 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <span className="mr-2">📈</span>
              注目銘柄
            </h2>
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 bg-blue-50 p-3 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">トヨタ自動車 (7203)</p>
                    <p className="text-sm text-gray-600 mt-1">
                      EV戦略の転換により、市場評価が上昇。2025年以降の成長期待が高まっています。
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">2024/02/15</span>
                </div>
              </div>
              <div className="border-l-4 border-green-500 bg-green-50 p-3 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">キーエンス (6861)</p>
                    <p className="text-sm text-gray-600 mt-1">
                      製造業のDX需要が高まり、受注が堅調。高ROEを維持しています。
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">2024/02/14</span>
                </div>
              </div>
              <div className="border-l-4 border-purple-500 bg-purple-50 p-3 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">ソニーグループ (6758)</p>
                    <p className="text-sm text-gray-600 mt-1">
                      ゲーム事業とエンタメ事業の相乗効果が期待されています。
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">2024/02/13</span>
                </div>
              </div>
            </div>
          </div>

          {/* 市場分析 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <span className="mr-2">📊</span>
              市場分析
            </h2>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-semibold mb-2">日経平均の動向</p>
                <p className="text-sm text-gray-600">
                  3万円台を維持。米国株高を背景に、輸出関連株が堅調。ただし、円高進行には注意が必要。
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-semibold mb-2">セクター別動向</p>
                <p className="text-sm text-gray-600">
                  自動車・機械が好調。一方、金融は低金利環境で苦戦。ITは個別銘柄で差が拡大。
                </p>
              </div>
            </div>
          </div>

          {/* 企業情報 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <span className="mr-2">🏢</span>
              企業情報
            </h2>
            <div className="space-y-3">
              <div className="p-3 border rounded">
                <p className="font-semibold">KDDI (9434)</p>
                <p className="text-sm text-gray-600 mt-1">
                  5G基地局の拡大と、新規サービス展開により、収益基盤が強化されています。
                </p>
              </div>
              <div className="p-3 border rounded">
                <p className="font-semibold">三菱商事 (8058)</p>
                <p className="text-sm text-gray-600 mt-1">
                  資源価格の上昇と、新興国事業の拡大が収益に寄与しています。
                </p>
              </div>
              <div className="p-3 border rounded">
                <p className="font-semibold">信越化学工業 (4063)</p>
                <p className="text-sm text-gray-600 mt-1">
                  半導体材料の需要拡大により、業績が堅調に推移しています。
                </p>
              </div>
            </div>
          </div>

          {/* 投資戦略 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <span className="mr-2">💡</span>
              投資戦略・ヒント
            </h2>
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                <p className="font-semibold mb-2">長期投資のすすめ</p>
                <p className="text-sm text-gray-700">
                  短期的な値動きに一喜一憂せず、企業の本質的価値を見極めることが重要です。
                </p>
              </div>
              <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
                <p className="font-semibold mb-2">分散投資の重要性</p>
                <p className="text-sm text-gray-700">
                  特定のセクターや銘柄に集中せず、リスクを分散させることが長期の安定につながります。
                </p>
              </div>
              <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="font-semibold mb-2">財務指標の見方</p>
                <p className="text-sm text-gray-700">
                  PER、PBR、ROEなどの指標は、業界平均や過去の実績と比較して判断することが大切です。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 外部リンク */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">外部リンク</h2>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://twitter.com/stock_unknown"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              X（Twitter）でフォロー
            </a>
            <a
              href="https://twitter.com/stock_unknown"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              最新ツイートを確認
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
