import { BaseTool, type ToolResult } from '../BaseTool.js';
import type { Tool } from '../../llm/types.js';

const TOOL_TEMPLATE = `import { BaseTool, type ToolResult } from '../src/tools/BaseTool.js';
import type { Tool } from '../src/llm/types.js';

export class {{CLASS_NAME}} extends BaseTool {
  readonly name = '{{TOOL_NAME}}';
  readonly description = '{{DESCRIPTION}}';

  getTools(): Tool[] {
    return [
{{TOOLS}}
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const params = args as Record<string, unknown>;

    switch (toolName) {
{{SWITCH_CASES}}
      default:
        return this.error(\`Unknown tool: \${toolName}\`);
    }
  }

{{METHODS}}
}

// Export for dynamic loading
export default {{CLASS_NAME}};
`;

const FUNCTION_TEMPLATE = `      {
        name: '{{FUNCTION_NAME}}',
        description: '{{FUNCTION_DESCRIPTION}}',
        parameters: {
          type: 'object',
          properties: {
{{PROPERTIES}}
          },
{{REQUIRED}}
        },
      }`;

const METHOD_TEMPLATE = `  private async {{METHOD_NAME}}(params: Record<string, unknown>): Promise<ToolResult> {
{{METHOD_BODY}}
  }
`;

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }>;
  implementation?: string;
}

export interface ToolDefinition {
  name: string;
  className: string;
  description: string;
  functions: FunctionDefinition[];
}

export class ToolGeneratorTool extends BaseTool {
  readonly name = 'tool_generator';
  readonly description = 'Generate new tools from definitions';

  getTools(): Tool[] {
    return [
      {
        name: 'generate_tool',
        description: 'Generate a new tool TypeScript file from a definition. The tool will be saved to the tools/ directory.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Tool name in snake_case (e.g., "currency_converter")',
            },
            className: {
              type: 'string',
              description: 'Class name in PascalCase (e.g., "CurrencyConverterTool")',
            },
            description: {
              type: 'string',
              description: 'Brief description of what the tool does',
            },
            functions: {
              type: 'array',
              description: 'Array of function definitions',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Function name in snake_case' },
                  description: { type: 'string', description: 'Function description' },
                  parameters: {
                    type: 'array',
                    description: 'Array of parameter definitions',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string' },
                        description: { type: 'string' },
                        required: { type: 'boolean' },
                      },
                    },
                  },
                  implementation: {
                    type: 'string',
                    description: 'TypeScript code for the method body (optional - will generate placeholder if not provided)',
                  },
                },
              },
            },
          },
          required: ['name', 'className', 'description', 'functions'],
        },
      },
      {
        name: 'get_tool_template',
        description: 'Get an example tool definition to use as reference',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'validate_tool_code',
        description: 'Validate that tool code has correct structure (basic syntax check)',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The TypeScript code to validate',
            },
          },
          required: ['code'],
        },
      },
    ];
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    switch (toolName) {
      case 'generate_tool':
        return this.generateTool(args as ToolDefinition);
      case 'get_tool_template':
        return this.getTemplate();
      case 'validate_tool_code':
        return this.validateCode((args as { code: string }).code);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private generateTool(def: ToolDefinition): ToolResult {
    try {
      // Validate definition
      if (!def.name || !def.className || !def.description || !def.functions) {
        return this.error('Missing required fields: name, className, description, functions');
      }

      if (def.functions.length === 0) {
        return this.error('At least one function is required');
      }

      // Generate functions array
      const functionsCode = def.functions.map(fn => this.generateFunctionCode(fn)).join(',\n');

      // Generate switch cases
      const switchCases = def.functions.map(fn => {
        const methodName = this.toMethodName(fn.name);
        return `      case '${fn.name}':\n        return this.${methodName}(params);`;
      }).join('\n');

      // Generate methods
      const methods = def.functions.map(fn => this.generateMethodCode(fn)).join('\n');

      // Fill template
      let code = TOOL_TEMPLATE
        .replace(/\{\{CLASS_NAME\}\}/g, def.className)
        .replace(/\{\{TOOL_NAME\}\}/g, def.name)
        .replace(/\{\{DESCRIPTION\}\}/g, def.description)
        .replace('{{TOOLS}}', functionsCode)
        .replace('{{SWITCH_CASES}}', switchCases)
        .replace('{{METHODS}}', methods);

      const filename = `tools/${def.className}.ts`;

      return this.success(JSON.stringify({
        filename,
        code,
        message: `Generated tool code for ${def.className}. Use fs_write to save it to ${filename}, then use load_tool to activate it.`,
      }, null, 2));
    } catch (error) {
      return this.error(`Failed to generate tool: ${(error as Error).message}`);
    }
  }

  private generateFunctionCode(fn: FunctionDefinition): string {
    const properties = fn.parameters.map(param => {
      return `            ${param.name}: {\n              type: '${param.type}',\n              description: '${param.description}',\n            }`;
    }).join(',\n');

    const required = fn.parameters
      .filter(p => p.required)
      .map(p => `'${p.name}'`);

    const requiredLine = required.length > 0
      ? `          required: [${required.join(', ')}],`
      : '';

    return FUNCTION_TEMPLATE
      .replace('{{FUNCTION_NAME}}', fn.name)
      .replace('{{FUNCTION_DESCRIPTION}}', fn.description)
      .replace('{{PROPERTIES}}', properties)
      .replace('{{REQUIRED}}', requiredLine);
  }

  private generateMethodCode(fn: FunctionDefinition): string {
    const methodName = this.toMethodName(fn.name);

    let body: string;
    if (fn.implementation) {
      body = fn.implementation.split('\n').map(line => '    ' + line).join('\n');
    } else {
      // Generate placeholder with parameter extraction
      const paramExtractions = fn.parameters.map(p => {
        return `    const ${p.name} = params['${p.name}'] as ${this.tsType(p.type)};`;
      }).join('\n');

      body = paramExtractions + '\n\n    // TODO: Implement logic here\n    return this.success(`${fn.name} called with params: ${JSON.stringify(params)}`);';
    }

    return METHOD_TEMPLATE
      .replace('{{METHOD_NAME}}', methodName)
      .replace('{{METHOD_BODY}}', body);
  }

  private toMethodName(functionName: string): string {
    // convert_currency -> convertCurrency
    return functionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private tsType(jsonType: string): string {
    switch (jsonType) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'array': return 'unknown[]';
      case 'object': return 'Record<string, unknown>';
      default: return 'unknown';
    }
  }

  private getTemplate(): ToolResult {
    const example: ToolDefinition = {
      name: 'calculator',
      className: 'CalculatorTool',
      description: 'Basic math operations',
      functions: [
        {
          name: 'calc_add',
          description: 'Add two numbers',
          parameters: [
            { name: 'a', type: 'number', description: 'First number', required: true },
            { name: 'b', type: 'number', description: 'Second number', required: true },
          ],
          implementation: `const a = params['a'] as number;
const b = params['b'] as number;
return this.success(String(a + b));`,
        },
        {
          name: 'calc_multiply',
          description: 'Multiply two numbers',
          parameters: [
            { name: 'a', type: 'number', description: 'First number', required: true },
            { name: 'b', type: 'number', description: 'Second number', required: true },
          ],
          implementation: `const a = params['a'] as number;
const b = params['b'] as number;
return this.success(String(a * b));`,
        },
      ],
    };

    return this.success(JSON.stringify(example, null, 2));
  }

  private validateCode(code: string): ToolResult {
    const errors: string[] = [];

    // Check for required imports
    if (!code.includes("import { BaseTool")) {
      errors.push('Missing BaseTool import');
    }

    // Check for class extending BaseTool
    if (!code.includes('extends BaseTool')) {
      errors.push('Class must extend BaseTool');
    }

    // Check for required properties
    if (!code.includes('readonly name =')) {
      errors.push('Missing "name" property');
    }
    if (!code.includes('readonly description =')) {
      errors.push('Missing "description" property');
    }

    // Check for required methods
    if (!code.includes('getTools()')) {
      errors.push('Missing getTools() method');
    }
    if (!code.includes('execute(')) {
      errors.push('Missing execute() method');
    }

    // Check for default export
    if (!code.includes('export default')) {
      errors.push('Missing default export (required for dynamic loading)');
    }

    if (errors.length > 0) {
      return this.error(`Validation failed:\n${errors.map(e => `- ${e}`).join('\n')}`);
    }

    return this.success('Validation passed! The tool code structure looks correct.');
  }
}
