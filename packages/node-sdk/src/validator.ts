import { Message } from './types';

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Event validator for message validation
 */
export class EventValidator {
  /**
   * Validate a message
   */
  validate(type: string, message: Message): ValidationResult {
    const errors: string[] = [];

    // Common validations
    if (!message) {
      return { valid: false, errors: ['Message is required'] };
    }

    // Type-specific validations
    switch (type) {
      case 'track':
        errors.push(...this.validateTrack(message as any));
        break;
      case 'identify':
        errors.push(...this.validateIdentify(message as any));
        break;
      case 'page':
        errors.push(...this.validatePage(message as any));
        break;
      case 'screen':
        errors.push(...this.validateScreen(message as any));
        break;
      case 'group':
        errors.push(...this.validateGroup(message as any));
        break;
      case 'alias':
        errors.push(...this.validateAlias(message as any));
        break;
      default:
        errors.push(`Unknown message type: ${type}`);
    }

    // Validate common fields
    if (!message.userId && !message.anonymousId) {
      errors.push('Either userId or anonymousId is required');
    }

    if (message.timestamp) {
      if (!this.isValidTimestamp(message.timestamp)) {
        errors.push('Invalid timestamp format');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateTrack(message: any): string[] {
    const errors: string[] = [];

    if (!message.event) {
      errors.push('Event name is required for track');
    } else if (typeof message.event !== 'string') {
      errors.push('Event name must be a string');
    } else if (message.event.length > 100) {
      errors.push('Event name must be less than 100 characters');
    }

    if (message.properties && typeof message.properties !== 'object') {
      errors.push('Properties must be an object');
    }

    return errors;
  }

  private validateIdentify(message: any): string[] {
    const errors: string[] = [];

    if (!message.userId) {
      errors.push('userId is required for identify');
    } else if (typeof message.userId !== 'string') {
      errors.push('userId must be a string');
    }

    if (message.traits && typeof message.traits !== 'object') {
      errors.push('Traits must be an object');
    }

    return errors;
  }

  private validatePage(message: any): string[] {
    const errors: string[] = [];

    if (message.name && typeof message.name !== 'string') {
      errors.push('Page name must be a string');
    }

    if (message.category && typeof message.category !== 'string') {
      errors.push('Page category must be a string');
    }

    if (message.properties && typeof message.properties !== 'object') {
      errors.push('Properties must be an object');
    }

    return errors;
  }

  private validateScreen(message: any): string[] {
    const errors: string[] = [];

    if (message.name && typeof message.name !== 'string') {
      errors.push('Screen name must be a string');
    }

    if (message.category && typeof message.category !== 'string') {
      errors.push('Screen category must be a string');
    }

    if (message.properties && typeof message.properties !== 'object') {
      errors.push('Properties must be an object');
    }

    return errors;
  }

  private validateGroup(message: any): string[] {
    const errors: string[] = [];

    if (!message.groupId) {
      errors.push('groupId is required for group');
    } else if (typeof message.groupId !== 'string') {
      errors.push('groupId must be a string');
    }

    if (message.traits && typeof message.traits !== 'object') {
      errors.push('Traits must be an object');
    }

    return errors;
  }

  private validateAlias(message: any): string[] {
    const errors: string[] = [];

    if (!message.userId) {
      errors.push('userId is required for alias');
    } else if (typeof message.userId !== 'string') {
      errors.push('userId must be a string');
    }

    if (!message.previousId) {
      errors.push('previousId is required for alias');
    } else if (typeof message.previousId !== 'string') {
      errors.push('previousId must be a string');
    }

    return errors;
  }

  private isValidTimestamp(timestamp: any): boolean {
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      return !isNaN(date.getTime());
    } else if (timestamp instanceof Date) {
      return !isNaN(timestamp.getTime());
    }
    return false;
  }

  /**
   * Sanitize PII from properties
   */
  sanitizePII(properties: Record<string, any>): Record<string, any> {
    const piiFields = [
      'password',
      'ssn',
      'social_security_number',
      'credit_card',
      'card_number',
      'cvv',
      'pin',
    ];

    const sanitized = { ...properties };

    for (const field of piiFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Mask email if needed
    if (sanitized.email && typeof sanitized.email === 'string') {
      const [username, domain] = sanitized.email.split('@');
      if (username && domain) {
        const maskedUsername = username.charAt(0) + '*'.repeat(username.length - 1);
        sanitized.email_masked = `${maskedUsername}@${domain}`;
      }
    }

    return sanitized;
  }
}