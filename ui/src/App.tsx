import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import System from './pages/System';
import Integrations from './pages/Integrations';
import DatabaseTables from './pages/DatabaseTables';
import LiveEvents from './pages/LiveEvents';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<System />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="database" element={<DatabaseTables />} />
        <Route path="events" element={<LiveEvents />} />
      </Route>
    </Routes>
  );
}

export default App;