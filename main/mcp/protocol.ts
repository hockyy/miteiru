import definitionsJson from "./definitions.json";
import type {AnalyzerResponse} from "../handler/languages/analyzerServer";

/**
 * MCP over JSON-RPC, Streamable HTTP with JSON responses only (docs/LOCAL_API.md). The same
 * definitions file is embedded by the stdio bridge (`miteiru --mcp`), which answers `initialize`
 * and `tools/list` from it, so both paths describe the tools the same way.
 */

interface PropertySchema {
  type: "string" | "integer" | "number";
  enum?: string[];
  default?: string | number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

interface ToolSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpDefinitions {
  protocolVersions: string[];
  serverInfo: {name: string; title: string};
  instructions: string;
  tools: Array<{name: string; title: string; description: string; inputSchema: ToolSchema; annotations: object}>;
}

export const mcpDefinitions = definitionsJson as unknown as McpDefinitions;

/** A failure the learner or the assistant can act on; `status` is its HTTP status on the REST routes. */
export class ToolError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const MAX_BATCH = 10;

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const codePointLength = (text: string) => Array.from(text).length;

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const findTool = (name: string) => mcpDefinitions.tools.find((tool) => tool.name === name);

const rangeText = (schema: PropertySchema) => {
  const {minimum, maximum} = schema;
  if (minimum !== undefined && maximum !== undefined) return `from ${minimum} to ${maximum}`;
  if (minimum !== undefined) return `${minimum} or more`;
  if (maximum !== undefined) return `${maximum} or less`;
  return "";
};

const validateProperty = (key: string, schema: PropertySchema, value: unknown) => {
  if (schema.type === "string") {
    if (typeof value !== "string") throw new ToolError(`${key} must be a string`);
    const length = codePointLength(value);
    if (schema.minLength !== undefined && length < schema.minLength) {
      throw new ToolError(schema.minLength === 1 ? `${key} must not be empty` : `${key} must have at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      throw new ToolError(`${key} must have at most ${schema.maxLength} characters`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      throw new ToolError(`${key} must be one of: ${schema.enum.join(", ")}`);
    }
    return;
  }
  const kind = schema.type === "integer" ? "an integer" : "a number";
  const range = rangeText(schema);
  const expected = `${key} must be ${kind}${range ? (schema.minimum !== undefined && schema.maximum !== undefined ? ` ${range}` : `, ${range}`) : ""}`;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ToolError(expected);
  if (schema.type === "integer" && !Number.isInteger(value)) throw new ToolError(expected);
  if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) {
    throw new ToolError(expected);
  }
};

/**
 * Checks `args` against the tool's input schema (the small subset the definitions use) and returns
 * them with defaults filled in. A null value counts as not given, since models send it for options
 * they skip.
 */
export const validateToolArguments = (name: string, args: unknown): Record<string, unknown> => {
  const tool = findTool(name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`, 404);
  const given = args === undefined || args === null ? {} : args;
  if (!isObject(given)) throw new ToolError("Arguments must be an object");

  const {properties, required = [], additionalProperties} = tool.inputSchema;
  if (additionalProperties === false) {
    for (const key of Object.keys(given)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) throw new ToolError(`Unknown argument: ${key}`);
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties)) {
    const value = given[key];
    if (value === undefined || value === null) {
      if (required.includes(key)) throw new ToolError(`Missing argument: ${key}`);
      if (schema.default !== undefined) result[key] = schema.default;
      continue;
    }
    validateProperty(key, schema, value);
    result[key] = value;
  }
  return result;
};

type JsonRpcId = string | number | null;

const reply = (id: JsonRpcId, result: unknown) => ({jsonrpc: "2.0", id, result});
const fail = (id: JsonRpcId, code: number, message: string) => ({jsonrpc: "2.0", id, error: {code, message}});

const toolFailure = (message: string) => ({content: [{type: "text", text: message}], isError: true});

const callToolMessage = async (id: JsonRpcId, params: unknown, callTool: ToolCall) => {
  const name = isObject(params) ? params.name : undefined;
  if (typeof name !== "string" || !findTool(name)) return fail(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);
  try {
    const args = validateToolArguments(name, (params as Record<string, unknown>).arguments);
    const result = await callTool(name, args);
    return reply(id, {content: [{type: "text", text: JSON.stringify(result)}], structuredContent: result});
  } catch (error) {
    // The model reads this and can retry, so a failed tool is a result, not a protocol error.
    return reply(id, toolFailure(errorMessage(error)));
  }
};

/** The answer to one JSON-RPC message, or undefined when it needs none (a response or a notification). */
const handleMessage = async (message: unknown, callTool: ToolCall, version: string) => {
  if (!isObject(message)) return fail(null, INVALID_REQUEST, "Invalid Request");
  if (typeof message.method !== "string" || message.id === undefined) return undefined;
  const id = message.id as JsonRpcId;
  const {method, params} = message;

  switch (method) {
    case "initialize": {
      const asked = isObject(params) ? params.protocolVersion : undefined;
      const {protocolVersions, serverInfo, instructions} = mcpDefinitions;
      return reply(id, {
        protocolVersion: typeof asked === "string" && protocolVersions.includes(asked) ? asked : protocolVersions[0],
        capabilities: {tools: {listChanged: false}},
        serverInfo: {name: serverInfo.name, title: serverInfo.title, version},
        instructions
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {tools: mcpDefinitions.tools});
    case "tools/call":
      return callToolMessage(id, params, callTool);
    default:
      return fail(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
};

/** One POST /mcp body: a message or a batch of them. Never throws. */
export const handleMcpBody = async (bodyText: string, callTool: ToolCall, version: string): Promise<AnalyzerResponse> => {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return {status: 400, value: fail(null, PARSE_ERROR, "Parse error")};
  }

  if (Array.isArray(body)) {
    // MCP dropped batches in 2025-06-18; older clients may still send small ones. One message at a
    // time, so a batch can't start dozens of YouTube runs at once.
    if (body.length === 0 || body.length > MAX_BATCH) {
      return {status: 400, value: fail(null, INVALID_REQUEST, `A batch must hold 1 to ${MAX_BATCH} messages.`)};
    }
    const answers = [];
    for (const message of body) {
      const answer = await handleMessage(message, callTool, version);
      if (answer !== undefined) answers.push(answer);
    }
    return answers.length > 0 ? {status: 200, value: answers} : {status: 202, value: undefined};
  }

  const answer = await handleMessage(body, callTool, version);
  return answer === undefined ? {status: 202, value: undefined} : {status: 200, value: answer};
};
