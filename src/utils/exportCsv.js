/**
 * Utility xuất dữ liệu Telemetry ra định dạng CSV (UTF-8 BOM chuẩn cho Excel)
 */
export function exportToCsv(type, data) {
  if (!data || !data.length) {
    alert('Không có dữ liệu để xuất!');
    return;
  }

  let csvContent = '\uFEFF'; // UTF-8 Byte Order Mark để Microsoft Excel mở tiếng Việt không lỗi font
  let headers = [];
  let rows = [];

  if (type === 'logs') {
    headers = [
      'ID',
      'Thời gian',
      'App',
      'Người dùng',
      'Thiết bị',
      'Địa chỉ IP',
      'Method',
      'Endpoint',
      'Trạng thái HTTP',
      'Thời gian xử lý (ms)',
      'Chi tiết lỗi / Tóm tắt',
    ];
    rows = data.map((l) => [
      l.id,
      l.created_at,
      l.app_identifier || '',
      l.user_name || '',
      l.device_name || '',
      l.ip_address || '',
      l.method,
      l.endpoint,
      l.status_code,
      l.duration_ms || 0,
      (l.error_message || l.response_payload || '').replace(/"/g, '""'),
    ]);
  } else if (type === 'crashes') {
    headers = [
      'ID',
      'Thời gian',
      'App',
      'Mức độ nghiêm trọng',
      'Ngoại lệ (Error Message)',
      'Thông tin thiết bị',
      'Stack Trace',
    ];
    rows = data.map((c) => [
      c.id,
      c.created_at,
      c.app_identifier || '',
      Number(c.is_fatal) === 1 ? 'Fatal Crash (Sập app)' : 'Non-fatal Exception',
      (c.error_message || '').replace(/"/g, '""'),
      (c.device_info || '').replace(/"/g, '""'),
      (c.stack_trace || '').replace(/"/g, '""'),
    ]);
  } else if (type === 'events') {
    headers = [
      'ID',
      'Thời gian',
      'App',
      'Tên sự kiện',
      'Loại sự kiện',
      'Màn hình (Screen)',
      'Người dùng (User)',
      'Thiết bị',
      'Tham số (Parameters)',
    ];
    rows = data.map((e) => [
      e.id,
      e.created_at,
      e.app_identifier || '',
      e.event_name,
      e.event_type || 'event',
      e.screen_name || '',
      e.user_name || e.user_id || '',
      e.device_name || '',
      (typeof e.parameters === 'object' ? JSON.stringify(e.parameters) : e.parameters || '').replace(/"/g, '""'),
    ]);
  } else if (type === 'timeline') {
    headers = [
      'ID',
      'Thời gian',
      'Khoảng cách (+delta)',
      'Phân loại',
      'Tiêu đề / Endpoint / Sự kiện',
      'Chi tiết / Trạng thái',
      'Người dùng',
      'Thiết bị',
    ];
    rows = data.map((item) => [
      item.id,
      item.created_at,
      item.time_delta || '',
      item.category,
      (item.title || '').replace(/"/g, '""'),
      (item.subtitle || item.error_message || '').replace(/"/g, '""'),
      item.user_name || '',
      item.device_name || '',
    ]);
  }

  csvContent += headers.map((h) => `"${h}"`).join(',') + '\r\n';
  rows.forEach((r) => {
    csvContent += r.map((val) => `"${val ?? ''}"`).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `gden_flow_${type}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
