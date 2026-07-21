import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isFirstRun: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('gilded_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);

  // Check if this is a first-run (no users exist) by trying to get /api/auth/me without token
  useEffect(() => {
    async function checkFirstRun() {
      try {
        const res = await api.get<{ user: User }>('/auth/me', token || undefined);
        setUser(res.user);
        setIsFirstRun(false);
      } catch {
        // If no token, check if first run
        if (!token) {
          try {
            // Try a simple get to see if the server responds
            await api.get('/auth/me');
          } catch {
            // If 401, not first run. If 404 maybe first run.
            setIsFirstRun(true);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    checkFirstRun();
  }, []);

  // Verify token on mount
  useEffect(() => {
    if (token) {
      api.get<{ user: User }>('/auth/me', token)
        .then((res) => {
          setUser(res.user);
          setIsFirstRun(false);
        })
        .catch(() => {
          localStorage.removeItem('gilded_token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('gilded_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setIsFirstRun(false);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', { email, password, name });
    localStorage.setItem('gilded_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setIsFirstRun(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gilded_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isFirstRun, login, register, logout }}>
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