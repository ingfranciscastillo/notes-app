import { api } from './api';
import type { User } from '../types';

/**
 * Auth service for managing user authentication
 */
class AuthService {
  private currentUser: User | null = null;

  constructor() {
    // Load user from localStorage on initialization
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          this.currentUser = JSON.parse(userStr);
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
        }
      }
    }
  }

  /**
   * Register a new user
   */
  async register(email: string, password: string): Promise<User> {
    const response = await api.register(email, password);
    this.setUser(response.user);
    return response.user;
  }

  /**
   * Login existing user
   */
  async login(email: string, password: string): Promise<User> {
    const response = await api.login(email, password);
    this.setUser(response.user);
    return response.user;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await api.logout();
    this.setUser(null);
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.currentUser;
  }

  /**
   * Set current user
   */
  private setUser(user: User | null): void {
    this.currentUser = user;
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
      }
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null && api.isAuthenticated();
  }
}

// Export singleton instance
export const auth = new AuthService();