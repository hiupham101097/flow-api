import React, { useMemo, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';

const WEB_STEPS = [
  { title: 'Angular interceptor', detail: 'Gắn apiLoggerInterceptor vào provideHttpClient để ghi nhận request, response và lỗi tập trung.', code: "provideHttpClient(withInterceptors([apiLoggerInterceptor]))" },
  { title: 'Axios', detail: 'Khởi tạo monitor một lần sau khi tạo Axios instance.', code: "setupAxiosMonitor(axios, 'vn.myportal.web');" },
  { title: 'Fetch', detail: 'Dùng monitoredFetch thay cho fetch mặc định tại lớp API.', code: "const monitoredFetch = createMonitoredFetch('vn.myportal.web');" },
];

const APP_STEPS = [
  { title: 'Crashlytics', detail: 'Khởi tạo telemetry trước runApp và chuyển FlutterError tới logger.', code: "await AppTelemetry.initialize(appId: 'vn.fizahub.app');" },
  { title: 'Dio interceptor', detail: 'Gắn interceptor vào Dio instance dùng chung của ứng dụng.', code: "dio.interceptors.add(ApiLoggerInterceptor(appId: 'vn.fizahub.app'));" },
  { title: 'HTTP client', detail: 'Bọc package http bằng LoggingClient để theo dõi tự động.', code: "final client = LoggingClient(http.Client(), appId: 'vn.fizahub.app');" },
];

export default function Setup() {
  const { platformScope } = usePlatform();
  const [copied, setCopied] = useState('');
  const steps = useMemo(() => platformScope === 'web' ? WEB_STEPS : APP_STEPS, [platformScope]);

  const copy = async (value, title) => {
    await navigator.clipboard.writeText(value);
    setCopied(title);
    window.setTimeout(() => setCopied(''), 1400);
  };

  return <div className="setup-page">
    <header className="page-heading">
      <div><h1>Cài đặt SDK</h1><p>Hướng dẫn nhanh cho phân hệ {platformScope === 'web' ? 'Web' : 'App'}. Chọn đúng adapter đang dùng trong dự án.</p></div>
    </header>
    <div className="setup-guide-list">
      {steps.map((step, index) => <section className="setup-guide" key={step.title}>
        <div className="setup-guide-index">{index + 1}</div>
        <div className="setup-guide-copy"><h2>{step.title}</h2><p>{step.detail}</p><pre><code>{step.code}</code></pre></div>
        <button type="button" className="secondary-btn" onClick={() => copy(step.code, step.title)}>{copied === step.title ? 'Đã chép' : 'Sao chép'}</button>
      </section>)}
    </div>
    <div className="state-block state-info"><strong>Lưu ý</strong><span>Giữ nguyên app ID/job ID đã cấp. Sau khi tích hợp, gửi một request thử rồi kiểm tra tại màn Giám sát.</span></div>
  </div>;
}
