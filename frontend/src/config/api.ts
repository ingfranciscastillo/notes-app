import type { AuthResponse, SyncRequest, SyncResponse } from '../types';

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4000';

/**
 * API client for backend communication
 */
class ApiClient {
  private accessToken: string | null = null;

  constructor() {
    // Load token from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
    }
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('accessToken', token);
      } else {
        localStorage.removeItem('accessToken');
      }
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_URL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authorization header if token exists
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Important for cookies
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Unknown Error',
        message: response.statusText,
      }));
      throw new Error(error.message || 'Request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Register a new user
   */
  async register(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setAccessToken(response.accessToken);
    return response;
  }

  /**
   * Login existing user
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setAccessToken(response.accessToken);
    return response;
  }

  /**
   * Refresh access token using refresh token cookie
   */
  async refreshToken(): Promise<string> {
    const response = await this.request<{ accessToken: string }>(
      '/auth/refresh',
      {
        method: 'POST',
      }
    );

    this.setAccessToken(response.accessToken);
    return response.accessToken;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
    });
    this.setAccessToken(null);
  }

  /**
   * Sync local changes with server
   */
  async sync(payload: SyncRequest): Promise<SyncResponse> {
    try {
      return await this.request<SyncResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // If token expired, try to refresh and retry
      if (
        error instanceof Error &&
        error.message.includes('expired')
      ) {
        await this.refreshToken();
        return this.request<SyncResponse>('/sync', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      throw error;
    }
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    noteId: string,
    resolution: 'server' | 'client' | 'manual',
    manualData?: { title: string; content: string }
  ): Promise<void> {
    await this.request('/sync/resolve', {
      method: 'POST',
      body: JSON.stringify({ noteId, resolution, manualData }),
    });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }
}

// Export singleton instance
export const api = new ApiClient();