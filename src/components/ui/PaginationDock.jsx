import React from 'react';
import CustomSelect from './CustomSelect';

export default function PaginationDock({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  if (totalItems <= 0) return null;

  return (
    <div className="pagination-dock">
      <div className="pagination-info">
        <span>Hiển thị <strong>{startItem} - {endItem}</strong> / <strong>{totalItems}</strong> mục</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginLeft: '0.65rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mỗi trang:</span>
          <CustomSelect
            className="select-pagination"
            value={pageSize}
            onChange={(val) => onPageSizeChange(Number(val))}
            options={[
              { value: 10, label: '10' },
              { value: 20, label: '20' },
              { value: 50, label: '50' },
              { value: 100, label: '100' },
            ]}
            ariaLabel="Số dòng mỗi trang"
          />
        </div>
      </div>

      <div className="pagination-nav">
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title="Trang đầu"
        >
          «
        </button>
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Trang trước"
        >
          ‹
        </button>

        <span style={{ margin: '0 0.5rem', fontWeight: 600, fontSize: '0.82rem' }}>
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Trang tiếp"
        >
          ›
        </button>
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Trang cuối"
        >
          »
        </button>
      </div>
    </div>
  );
}
