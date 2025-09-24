import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Events from './pages/Events';
import Sources from './pages/Sources';
import Destinations from './pages/Destinations';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="events" element={<Events />} />
        <Route path="sources" element={<Sources />} />
        <Route path="destinations" element={<Destinations />} />
        <Route path="transformations" element={<div className="p-4">Transformations page coming soon...</div>} />
        <Route path="users" element={<div className="p-4">Users page coming soon...</div>} />
        <Route path="settings" element={<div className="p-4">Settings page coming soon...</div>} />
      </Route>
    </Routes>
  );
}

export default App;