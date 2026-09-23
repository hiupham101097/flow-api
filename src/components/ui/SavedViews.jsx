import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'gden-flow:saved-monitor-views';
const MAX_VIEWS = 8;

function readViews() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, MAX_VIEWS) : [];
  } catch {
    return [];
  }
}

export default function SavedViews({ onNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [views, setViews] = useState(readViews);
  const [name, setName] = useState('');
  const currentUrl = `${location.pathname}${location.search}`;
  const currentIsSaved = useMemo(() => views.some((view) => view.url === currentUrl), [views, currentUrl]);

  const persist = (next) => {
    const limited = next.slice(0, MAX_VIEWS);
    setViews(limited);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed || currentIsSaved) return;
    persist([{ id: `${Date.now()}`, name: trimmed.slice(0, 48), url: currentUrl }, ...views]);
    setName('');
  };

  const handleSelectView = (url) => {
    navigate(url);
    if (onNavigate) onNavigate();
  };

  return (
    <div className="saved-views" aria-label="Bộ lọc đã lưu">
      <div className="saved-views-create">
        <label className="sr-only" htmlFor="saved-view-name">Tên view</label>
        <input
          id="saved-view-name"
          value={name}
          maxLength={48}
          placeholder="Đặt tên view hiện tại..."
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && saveCurrent()}
        />
        <button type="button" className="secondary-btn compact-btn" onClick={saveCurrent} disabled={!name.trim() || currentIsSaved}>
          {currentIsSaved ? 'Đã lưu' : '+ Lưu view'}
        </button>
      </div>
      {views.length > 0 && (
        <div className="saved-views-list">
          {views.map((view) => (
            <span className="saved-view-chip" key={view.id}>
              <button type="button" onClick={() => handleSelectView(view.url)} title={view.url}>
                <span className="saved-view-icon">🔖</span>
                <span>{view.name}</span>
              </button>
              <button
                type="button"
                className="saved-view-remove"
                aria-label={`Xóa view ${view.name}`}
                title="Xóa view này"
                onClick={() => persist(views.filter((item) => item.id !== view.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
