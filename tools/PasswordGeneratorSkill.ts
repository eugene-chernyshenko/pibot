import { BaseTool, type ToolResult } from '../src/tools/BaseTool.js';
import type { Tool } from '../src/llm/types.js';

export class PasswordGeneratorTool extends BaseTool {
  readonly name = 'password_generator';
  readonly description = 'Generates secure passwords with customizable options';

  getTools(): Tool[] {
    return [
      {
        name: 'generate_password',
        description: 'Generate a secure password with specified options',
        parameters: {
          type: 'object',
          properties: {
            length: {
              type: 'number',
              description: 'Length of the password (default: 12)',
            },
            include_uppercase: {
              type: 'boolean',
              description: 'Include uppercase letters (default: true)',
            },
            include_lowercase: {
              type: 'boolean',
              description: 'Include lowercase letters (default: true)',
            },
            include_numbers: {
              type: 'boolean',
              description: 'Include numbers (default: true)',
            },
            include_symbols: {
              type: 'boolean',
              description: 'Include special symbols (default: true)',
            },
            exclude_ambiguous: {
              type: 'boolean',
              description: 'Exclude ambiguous characters like 0, O, l, I (default: false)',
            }
          },
        },
      },
      {
        name: 'generate_passphrase',
        description: 'Generate a passphrase using random words',
        parameters: {
          type: 'object',
          properties: {
            word_count: {
              type: 'number',
              description: 'Number of words in passphrase (default: 4)',
            },
            separator: {
              type: 'string',
              description: 'Separator between words (default: \'-\')',
            },
            capitalize: {
              type: 'boolean',
              description: 'Capitalize first letter of each word (default: false)',
            },
            add_numbers: {
              type: 'boolean',
              description: 'Add random numbers to the passphrase (default: false)',
            }
          },
        },
      },
      {
        name: 'check_password_strength',
        description: 'Check the strength of a given password',
        parameters: {
          type: 'object',
          properties: {
            password: {
              type: 'string',
              description: 'Password to check',
            }
          },
          required: ['password'],
        },
      }
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'generate_password':
        return this.generatePassword(params);
      case 'generate_passphrase':
        return this.generatePassphrase(params);
      case 'check_password_strength':
        return this.checkPasswordStrength(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private async generatePassword(params: Record<string, unknown>): Promise<ToolResult> {
    const length = (params.length as number) || 12;
    const includeUppercase = params.include_uppercase !== false;
    const includeLowercase = params.include_lowercase !== false;
    const includeNumbers = params.include_numbers !== false;
    const includeSymbols = params.include_symbols !== false;
    const excludeAmbiguous = params.exclude_ambiguous || false;

    let charset = '';
    
    if (includeUppercase) {
      charset += excludeAmbiguous ? 'ABCDEFGHJKMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    if (includeLowercase) {
      charset += excludeAmbiguous ? 'abcdefghijkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
    }
    
    if (includeNumbers) {
      charset += excludeAmbiguous ? '23456789' : '0123456789';
    }
    
    if (includeSymbols) {
      charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }

    if (charset === '') {
      return this.error('At least one character type must be included');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    return this.success({ 
      password: password,
      length: length,
      charset_size: charset.length
    });
  }

  private async generatePassphrase(params: Record<string, unknown>): Promise<ToolResult> {
    const wordCount = (params.word_count as number) || 4;
    const separator = (params.separator as string) || '-';
    const capitalize = params.capitalize || false;
    const addNumbers = params.add_numbers || false;

    const words = [
      'apple', 'brave', 'chair', 'dance', 'eagle', 'flame', 'green', 'heart',
      'index', 'judge', 'knife', 'light', 'magic', 'nurse', 'ocean', 'peace',
      'queen', 'robot', 'stone', 'tiger', 'unity', 'voice', 'water', 'xenon',
      'youth', 'zebra', 'amber', 'beach', 'cloud', 'dream', 'earth', 'frost',
      'grace', 'horse', 'ivory', 'jewel', 'karma', 'lemon', 'mouse', 'night',
      'orbit', 'piano', 'quilt', 'river', 'solar', 'trust', 'ultra', 'vivid'
    ];

    let passphrase = [];
    
    for (let i = 0; i < wordCount; i++) {
      let word = words[Math.floor(Math.random() * words.length)];
      
      if (capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      
      passphrase.push(word);
    }

    let result = passphrase.join(separator);
    
    if (addNumbers) {
      const randomNumber = Math.floor(Math.random() * 1000);
      result += separator + randomNumber;
    }

    return this.success({
      passphrase: result,
      word_count: wordCount,
      length: result.length
    });
  }

  private async checkPasswordStrength(params: Record<string, unknown>): Promise<ToolResult> {
    const password = params.password as string;
    
    if (!password) {
      return this.error('Password is required');
    }

    const length = password.length;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[^A-Za-z0-9]/.test(password);
    
    let score = 0;
    let feedback = [];
    
    if (length >= 8) score += 1;
    else feedback.push('Use at least 8 characters');
    
    if (length >= 12) score += 1;
    
    if (hasUppercase) score += 1;
    else feedback.push('Add uppercase letters');
    
    if (hasLowercase) score += 1;
    else feedback.push('Add lowercase letters');
    
    if (hasNumbers) score += 1;
    else feedback.push('Add numbers');
    
    if (hasSymbols) score += 1;
    else feedback.push('Add special symbols');
    
    let strength;
    if (score <= 2) strength = 'Very Weak';
    else if (score <= 3) strength = 'Weak';
    else if (score <= 4) strength = 'Fair';
    else if (score <= 5) strength = 'Good';
    else strength = 'Strong';
    
    return this.success({
      password: password,
      strength: strength,
      score: score,
      max_score: 6,
      length: length,
      has_uppercase: hasUppercase,
      has_lowercase: hasLowercase,
      has_numbers: hasNumbers,
      has_symbols: hasSymbols,
      feedback: feedback
    });
  }
}

// Export for dynamic loading
export default PasswordGeneratorTool;