import React from 'react';

/**
 * Hiệu ứng Skeleton Shimmer tải trước khi dữ liệu telemetry về
 */
export function SkeletonRows({ columns = 6, rows = 5 }) {
  const widths = ['70%', '85%', '60%', '90%', '75%', '50%', '80%', '65%'];

  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={`skeleton-row-${rIdx}`} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={`skeleton-cell-${rIdx}-${cIdx}`}>
              <div
                className="skeleton-shimmer skeleton-line"
                style={{
                  width: widths[(rIdx + cIdx) % widths.length],
                  height: cIdx === 0 ? '18px' : '14px',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="metrics-strip" style={{ marginBottom: '1rem' }} aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={`sk-card-${idx}`} className="metric-card" style={{ padding: '0.85rem' }}>
          <div className="skeleton-shimmer" style={{ width: '40%', height: '12px', marginBottom: '0.5rem' }} />
          <div className="skeleton-shimmer" style={{ width: '65%', height: '24px' }} />
        </div>
      ))}
    </div>
  );
}
