import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AnnouncementBanner } from './AnnouncementBanner';

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnnouncementBanner />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
