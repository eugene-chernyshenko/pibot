import { BaseTool, type ToolResult } from '../BaseTool.js';
import type { Tool } from '../../llm/types.js';

export class DateTimeTool extends BaseTool {
  readonly name = 'datetime';
  readonly description = 'Date and time utilities';

  getTools(): Tool[] {
    return [
      {
        name: 'get_current_time',
        description: 'Get the current date and time',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone name (e.g., "America/New_York", "Europe/London"). Defaults to local timezone.',
            },
            format: {
              type: 'string',
              description: 'Output format: "iso", "locale", or "unix". Defaults to "locale".',
              enum: ['iso', 'locale', 'unix'],
            },
          },
        },
      },
      {
        name: 'parse_date',
        description: 'Parse a date string and return formatted output',
        parameters: {
          type: 'object',
          properties: {
            dateString: {
              type: 'string',
              description: 'The date string to parse',
            },
            outputFormat: {
              type: 'string',
              description: 'Output format: "iso", "locale", or "unix". Defaults to "locale".',
              enum: ['iso', 'locale', 'unix'],
            },
          },
          required: ['dateString'],
        },
      },
      {
        name: 'calculate_date_diff',
        description: 'Calculate the difference between two dates',
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date string',
            },
            endDate: {
              type: 'string',
              description: 'End date string (defaults to now)',
            },
            unit: {
              type: 'string',
              description: 'Unit for the difference: "days", "hours", "minutes", "seconds"',
              enum: ['days', 'hours', 'minutes', 'seconds'],
            },
          },
          required: ['startDate'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
      case 'get_current_time':
        return this.getCurrentTime(params);
      case 'parse_date':
        return this.parseDate(params);
      case 'calculate_date_diff':
        return this.calculateDateDiff(params);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private getCurrentTime(params: Record<string, unknown>): ToolResult {
    const format = (params['format'] as string) || 'locale';
    const timezone = params['timezone'] as string | undefined;

    try {
      const now = new Date();

      let result: string;
      switch (format) {
        case 'iso':
          result = now.toISOString();
          break;
        case 'unix':
          result = Math.floor(now.getTime() / 1000).toString();
          break;
        case 'locale':
        default:
          const options: Intl.DateTimeFormatOptions = {
            dateStyle: 'full',
            timeStyle: 'long',
          };
          if (timezone) {
            options.timeZone = timezone;
          }
          result = now.toLocaleString('en-US', options);
          break;
      }

      return this.success(result);
    } catch (error) {
      return this.error(`Failed to get current time: ${(error as Error).message}`);
    }
  }

  private parseDate(params: Record<string, unknown>): ToolResult {
    const dateString = params['dateString'] as string;
    const outputFormat = (params['outputFormat'] as string) || 'locale';

    if (!dateString) {
      return this.error('dateString is required');
    }

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return this.error(`Invalid date string: ${dateString}`);
      }

      let result: string;
      switch (outputFormat) {
        case 'iso':
          result = date.toISOString();
          break;
        case 'unix':
          result = Math.floor(date.getTime() / 1000).toString();
          break;
        case 'locale':
        default:
          result = date.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'long',
          });
          break;
      }

      return this.success(result);
    } catch (error) {
      return this.error(`Failed to parse date: ${(error as Error).message}`);
    }
  }

  private calculateDateDiff(params: Record<string, unknown>): ToolResult {
    const startDateStr = params['startDate'] as string;
    const endDateStr = params['endDate'] as string | undefined;
    const unit = (params['unit'] as string) || 'days';

    if (!startDateStr) {
      return this.error('startDate is required');
    }

    try {
      const startDate = new Date(startDateStr);
      const endDate = endDateStr ? new Date(endDateStr) : new Date();

      if (isNaN(startDate.getTime())) {
        return this.error(`Invalid start date: ${startDateStr}`);
      }
      if (isNaN(endDate.getTime())) {
        return this.error(`Invalid end date: ${endDateStr}`);
      }

      const diffMs = endDate.getTime() - startDate.getTime();

      let diff: number;
      switch (unit) {
        case 'seconds':
          diff = Math.floor(diffMs / 1000);
          break;
        case 'minutes':
          diff = Math.floor(diffMs / (1000 * 60));
          break;
        case 'hours':
          diff = Math.floor(diffMs / (1000 * 60 * 60));
          break;
        case 'days':
        default:
          diff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          break;
      }

      return this.success(`${diff} ${unit}`);
    } catch (error) {
      return this.error(`Failed to calculate date difference: ${(error as Error).message}`);
    }
  }
}
