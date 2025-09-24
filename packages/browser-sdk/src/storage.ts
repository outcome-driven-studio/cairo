import { Utils } from './utils';

export class Storage {
  private cookieDomain: string;
  private cookieSecure: boolean;

  constructor(cookieDomain: string = '', cookieSecure: boolean = true) {
    this.cookieDomain = cookieDomain;
    this.cookieSecure = cookieSecure;
  }

  // Anonymous ID management
  getAnonymousId(): string {
    let id = this.getCookie('cairo_anonymous_id');
    if (!id) {
      id = Utils.generateId();
      this.setAnonymousId(id);
    }
    return id;
  }

  setAnonymousId(id: string): void {
    this.setCookie('cairo_anonymous_id', id, 365); // 1 year
    this.setLocalStorage('cairo_anonymous_id', id);
  }

  // User ID management
  getUserId(): string | null {
    return this.getCookie('cairo_user_id') || this.getLocalStorage('cairo_user_id');
  }

  setUserId(userId: string): void {
    this.setCookie('cairo_user_id', userId, 365);
    this.setLocalStorage('cairo_user_id', userId);
  }

  // User traits management
  getTraits(): Record<string, any> {
    try {
      const traits = this.getLocalStorage('cairo_traits');
      return traits ? JSON.parse(traits) : {};
    } catch {
      return {};
    }
  }

  setTraits(traits: Record<string, any>): void {
    this.setLocalStorage('cairo_traits', JSON.stringify(traits));
  }

  // Consent management
  getConsent(): { granted: boolean; categories: string[] } {
    try {
      const consent = this.getLocalStorage('cairo_consent');
      const categories = this.getLocalStorage('cairo_consent_categories');

      return {
        granted: consent === 'granted',
        categories: categories ? JSON.parse(categories) : [],
      };
    } catch {
      return { granted: false, categories: [] };
    }
  }

  setConsent(granted: boolean, categories: string[] = []): void {
    this.setLocalStorage('cairo_consent', granted ? 'granted' : 'denied');
    this.setLocalStorage('cairo_consent_categories', JSON.stringify(categories));
  }

  // Reset all stored data
  reset(): void {
    this.removeCookie('cairo_user_id');
    this.removeCookie('cairo_anonymous_id');
    this.removeLocalStorage('cairo_user_id');
    this.removeLocalStorage('cairo_anonymous_id');
    this.removeLocalStorage('cairo_traits');
    this.removeLocalStorage('cairo_consent');
    this.removeLocalStorage('cairo_consent_categories');
  }

  // Cookie methods
  private setCookie(name: string, value: string, days: number): void {
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

      let cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/`;

      if (this.cookieDomain) {
        cookie += `; domain=${this.cookieDomain}`;
      }

      if (this.cookieSecure && location.protocol === 'https:') {
        cookie += '; secure';
      }

      cookie += '; samesite=lax';

      document.cookie = cookie;
    } catch (error) {
      // Ignore cookie errors in environments where cookies aren't supported
    }
  }

  private getCookie(name: string): string | null {
    try {
      const nameEQ = name + '=';
      const cookies = document.cookie.split(';');

      for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
          return decodeURIComponent(cookie.substring(nameEQ.length));
        }
      }
    } catch (error) {
      // Ignore cookie errors
    }
    return null;
  }

  private removeCookie(name: string): void {
    this.setCookie(name, '', -1);
  }

  // localStorage methods
  private setLocalStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Ignore localStorage errors (private browsing, quota exceeded, etc.)
    }
  }

  private getLocalStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  private removeLocalStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Ignore localStorage errors
    }
  }
}