import { useEffect } from 'react';
import { healthCheck } from './api/client';
import './App.css';

function App() {
  useEffect(() => {
    // Mount: call health check and log result
    healthCheck()
      .then((data) => {
        console.log('Backend connected:', data);
      })
      .catch((error) => {
        console.error('Backend connection failed:', error.message);
      });
  }, []);

  return (
    <div className="app-shell">
      {/* ===== Left Panel: Toolbox Placeholder ===== */}
      <aside className="panel panel-left" id="toolbox-panel">
        <div className="panel-header">
          <h3 className="panel-title">工具箱</h3>
        </div>
        <div className="panel-content">
          <p className="placeholder-text">工具箱面板 (开发中)</p>
        </div>
      </aside>

      {/* ===== Center Panel: Canvas Placeholder ===== */}
      <main className="panel panel-center" id="canvas-panel">
        <div className="canvas-placeholder">
          <div className="canvas-hint">
            <span className="canvas-icon">&#x1F4D0;</span>
            <p>画布区域</p>
            <p className="canvas-sub-hint">从左侧工具箱拖拽元素到此处</p>
          </div>
        </div>
      </main>

      {/* ===== Right Panel: Properties Placeholder ===== */}
      <aside className="panel panel-right" id="properties-panel">
        <div className="panel-header">
          <h3 className="panel-title">属性</h3>
        </div>
        <div className="panel-content">
          <p className="placeholder-text">属性面板 — 选择元素后显示属性</p>
        </div>
      </aside>
    </div>
  );
}

export default App;
