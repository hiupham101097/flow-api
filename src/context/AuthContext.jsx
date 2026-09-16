import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { getStoredAuthUser, setStoredAuthUser, clearStoredAuthUser, setStoredPlatformScope } from '../utils/cookies';
import { usePlatform } from './PlatformContext';

const USERS_DB = [
  {
    username: 'web-dev',
    password: '123qwe',
    role: 'web',
    name: 'Web Developer',
    description: 'Chuyên viên Quản lý Hệ thống Web (Angular / React)',
  },
  {
    username: 'app-dev',
    password: '123qwe',
    role: 'app',
    name: 'Flutter App Developer',
    description: 'Chuyên viên Quản lý Ứng dụng Di động (Flutter / Mobile)',
  },
];

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  login: () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }) {
  const initialUser = getStoredAuthUser();
  const [user, setUser] = useState(initialUser);
  const { selectPlatform } = usePlatform();

  // Đồng bộ platformScope tương ứng với role của user khi load lại trang
  useEffect(() => {
    if (user && user.role) {
      selectPlatform(user.role, true);
    }
  }, [user]);

  const login = (username, password) => {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    const matched = USERS_DB.find(
      (u) => u.username === cleanUser && u.password === cleanPass
    );

    if (!matched) {
      return {
        success: false,
        error: 'Tên đăng nhập hoặc mật khẩu không chính xác. (Mật khẩu mặc định: 123qwe)',
      };
    }

    const userData = {
      username: matched.username,
      role: matched.role,
      name: matched.name,
      description: matched.description,
    };

    setUser(userData);
    setStoredAuthUser(userData);

    // Chuyển role phân hệ và lưu cookie:
    // web-dev -> xem log của web
    // app-dev -> xem log của app flutter
    selectPlatform(matched.role, true);

    return { success: true, user: userData };
  };

  const logout = () => {
    setUser(null);
    clearStoredAuthUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Component bảo vệ các trang Dashboard - bắt buộc phải đăng nhập mới được vào
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
