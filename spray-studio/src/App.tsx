/**
 * Spray Studio routes (served under /spray/):
 *   /spray/                 → a fresh studio room (admins), or the sign-in card
 *   /spray/studio/:roomId   → the studio: paint the merch with the mouse, a touchscreen, or phones
 *   /spray/join/:roomId     → a phone joining a room as a spray can (anyone with the room's QR)
 * Ported from AiroHub (RethinkRealityAI/AiroHub); the landing page, AI, admin and review parts are not.
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import NotFound from './components/NotFound';
import { AdminGate } from './spray/AdminGate';

const CanvasView = lazy(() => import('./components/CanvasView'));
const ControllerView = lazy(() => import('./components/ControllerView'));

const newRoom = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const Loading = ({ label }: { label: string }) => (
  <div className="min-h-[100svh] stage-vignette grid place-items-center">
    <span className="airo-breathe label-caps text-white/40">{label}</span>
  </div>
);

export default function App() {
  return (
    <Router basename="/spray">
      <Routes>
        {['/', '/index.html'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <AdminGate>
                <Navigate to={`/studio/${newRoom()}${window.location.search}`} replace />
              </AdminGate>
            }
          />
        ))}
        <Route
          path="/studio/:roomId"
          element={
            <AdminGate>
              <Suspense fallback={<Loading label="Loading studio…" />}>
                <CanvasView />
              </Suspense>
            </AdminGate>
          }
        />
        <Route
          path="/join/:roomId"
          element={
            <Suspense fallback={<Loading label="Loading spray can…" />}>
              <ControllerView />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
