import { BaseSkill, type ToolResult } from '../BaseSkill.js';
import type { Tool } from '../../llm/types.js';

const SKILL_TEMPLATE = `import { BaseSkill, type ToolResult } from '../src/skills/BaseSkill.js';
import type { Tool } from '../src/llm/types.js';

export class {{CLASS_NAME}} extends BaseSkill {
  readonly name = '{{SKILL_NAME}}';
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

const TOOL_TEMPLATE = `      {
        name: '{{TOOL_NAME}}',
        description: '{{TOOL_DESCRIPTION}}',
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

export interface ToolDefinition {
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

export interface SkillDefinition {
  name: string;
  className: string;
  description: string;
  tools: ToolDefinition[];
}

export class SkillGeneratorSkill extends BaseSkill {
  readonly name = 'skill_generator';
  readonly description = 'Generate new skills from definitions';

  getTools(): Tool[] {
    return [
      {
        name: 'generate_skill',
        description: 'Generate a new skill TypeScript file from a definition. The skill will be saved to the skills/ directory.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Skill name in snake_case (e.g., "currency_converter")',
            },
            className: {
              type: 'string',
              description: 'Class name in PascalCase (e.g., "CurrencyConverterSkill")',
            },
            description: {
              type: 'string',
              description: 'Brief description of what the skill does',
            },
            tools: {
              type: 'array',
              description: 'Array of tool definitions',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Tool name in snake_case' },
                  description: { type: 'string', description: 'Tool description' },
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
          required: ['name', 'className', 'description', 'tools'],
        },
      },
      {
        name: 'get_skill_template',
        description: 'Get an example skill definition to use as reference',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'validate_skill_code',
        description: 'Validate that skill code has correct structure (basic syntax check)',
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
      case 'generate_skill':
        return this.generateSkill(args as SkillDefinition);
      case 'get_skill_template':
        return this.getTemplate();
      case 'validate_skill_code':
        return this.validateCode((args as { code: string }).code);
      default:
        return this.error(`Unknown tool: ${toolName}`);
    }
  }

  private generateSkill(def: SkillDefinition): ToolResult {
    try {
      // Validate definition
      if (!def.name || !def.className || !def.description || !def.tools) {
        return this.error('Missing required fields: name, className, description, tools');
      }

      if (def.tools.length === 0) {
        return this.error('At least one tool is required');
      }

      // Generate tools array
      const toolsCode = def.tools.map(tool => this.generateToolCode(tool)).join(',\n');

      // Generate switch cases
      const switchCases = def.tools.map(tool => {
        const methodName = this.toMethodName(tool.name);
        return `      case '${tool.name}':\n        return this.${methodName}(params);`;
      }).join('\n');

      // Generate methods
      const methods = def.tools.map(tool => this.generateMethodCode(tool)).join('\n');

      // Fill template
      let code = SKILL_TEMPLATE
        .replace(/\{\{CLASS_NAME\}\}/g, def.className)
        .replace(/\{\{SKILL_NAME\}\}/g, def.name)
        .replace(/\{\{DESCRIPTION\}\}/g, def.description)
        .replace('{{TOOLS}}', toolsCode)
        .replace('{{SWITCH_CASES}}', switchCases)
        .replace('{{METHODS}}', methods);

      const filename = `skills/${def.className}.ts`;

      return this.success(JSON.stringify({
        filename,
        code,
        message: `Generated skill code for ${def.className}. Use fs_write to save it to ${filename}, then use load_skill to activate it.`,
      }, null, 2));
    } catch (error) {
      return this.error(`Failed to generate skill: ${(error as Error).message}`);
    }
  }

  private generateToolCode(tool: ToolDefinition): string {
    const properties = tool.parameters.map(param => {
      return `            ${param.name}: {\n              type: '${param.type}',\n              description: '${param.description}',\n            }`;
    }).join(',\n');

    const required = tool.parameters
      .filter(p => p.required)
      .map(p => `'${p.name}'`);

    const requiredLine = required.length > 0
      ? `          required: [${required.join(', ')}],`
      : '';

    return TOOL_TEMPLATE
      .replace('{{TOOL_NAME}}', tool.name)
      .replace('{{TOOL_DESCRIPTION}}', tool.description)
      .replace('{{PROPERTIES}}', properties)
      .replace('{{REQUIRED}}', requiredLine);
  }

  private generateMethodCode(tool: ToolDefinition): string {
    const methodName = this.toMethodName(tool.name);

    let body: string;
    if (tool.implementation) {
      body = tool.implementation.split('\n').map(line => '    ' + line).join('\n');
    } else {
      // Generate placeholder with parameter extraction
      const paramExtractions = tool.parameters.map(p => {
        return `    const ${p.name} = params['${p.name}'] as ${this.tsType(p.type)};`;
      }).join('\n');

      body = paramExtractions + '\n\n    // TODO: Implement logic here\n    return this.success(`${tool.name} called with params: ${JSON.stringify(params)}`);';
    }

    return METHOD_TEMPLATE
      .replace('{{METHOD_NAME}}', methodName)
      .replace('{{METHOD_BODY}}', body);
  }

  private toMethodName(toolName: string): string {
    // convert_currency -> convertCurrency
    return toolName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
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
    const example: SkillDefinition = {
      name: 'calculator',
      className: 'CalculatorSkill',
      description: 'Basic math operations',
      tools: [
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
    if (!code.includes("import { BaseSkill")) {
      errors.push('Missing BaseSkill import');
    }

    // Check for class extending BaseSkill
    if (!code.includes('extends BaseSkill')) {
      errors.push('Class must extend BaseSkill');
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

    return this.success('Validation passed! The skill code structure looks correct.');
  }
}
