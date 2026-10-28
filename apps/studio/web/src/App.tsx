import React, { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard';
import { ProjectView } from './ProjectView';

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = hash.match(/^#\/p\/([^/]+)(?:\/(\w+))?/);
  return m ? { id: decodeURIComponent(m[1]!), tab: m[2] ?? 'storyboard' } : null;
}

export const App: React.FC = () => {
  const route = useRoute();
  return (
    <>
      <div className="topbar">
        <a href="#/" style={{ textDecoration: 'none' }}>
          <div className="brand">
            The Unbuilt World <span className="muted">Studio</span>
            <small>Stories from the futures we left behind.</small>
          </div>
        </a>
      </div>
      <div className="page">{route ? <ProjectView key={route.id} id={route.id} tab={route.tab} /> : <Dashboard />}</div>
    </>
  );
};
