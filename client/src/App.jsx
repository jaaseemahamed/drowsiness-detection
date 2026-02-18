import React, { useState } from 'react';
import { Layout, ShieldCheck, PieChart } from 'lucide-react';
import Projects from './components/Projects';
import DrowsinessDetector from './components/DrowsinessDetector';
import './index.css';

import Login from './components/Login';

function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="layout-root">
      {/* Main Content Area */}
      <main className="main-content" style={{ marginLeft: 0, padding: '2rem' }}>
        <div className="content-container">
          <DrowsinessDetector user={user} onLogout={() => setUser(null)} />
        </div>
      </main>
    </div>
  );
}

export default App;
