# @soulofmischief/mcp-client-sdk

![NPM Version](https://img.shields.io/npm/v/%40soulofmischief%2Fmcp-client-sdk) ![MIT licensed](https://img.shields.io/npm/l/%40soulofmischief%2Fmcp-client-sdk)

Browser-compatible TypeScript Client SDK for the Model Context Protocol (MCP)

This repository is a fork of the official Model Context Protocol (MCP) TypeScript SDK, available at [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk).

## Overview

This version of the SDK has been adapted for use in environments that may not have a standard Node.js runtime, such as web browsers or mobile applications. The primary modification is the removal of server-specific components and transports (like Stdio and Streamable HTTP server handlers) that rely on Node.js APIs.

Despite these modifications, this SDK retains **full client-side compatibility** with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) specification. Clients developed using this SDK can interact seamlessly with any standard MCP-compliant server.

A key addition in this fork is the `PseudoTransport`. This transport allows an MCP client instance to communicate directly with an MCP server instance within the same JavaScript process, bypassing network or stdio layers. This is particularly useful for testing, demonstrations, or tightly integrated applications.

## Installation

```
npm install @soulofmischief/mcp-client-sdk
```

## Key Differences from Official SDK

*   **Client-Focused:** Server-specific transports (`StdioServerTransport`, `StreamableHTTPServerTransport`, `SSEServerTransport`) and associated Node.js dependencies have been removed.
*   **Environment Support:** Designed for broader compatibility, including web browsers and other non-Node.js environments.
*   **PseudoTransport Included:** Provides an implementation (`PseudoTransport`) for direct in-process client-server communication. Note that while server *transports* are removed, the core `McpServer` class is retained to facilitate the use of `PseudoTransport`.

## MCP Compatibility

This SDK's `Client` implementation strictly adheres to the MCP specification. You can confidently use it to connect to and interact with any standard MCP server, utilizing features like listing and calling tools, reading resources, and managing the connection lifecycle.

## PseudoTransport

The `PseudoTransport` enables direct communication between an `mcp-client-sdk` `Client` and an `McpServer` instance running in the same process. This eliminates the need for network requests or standard I/O piping, simplifying local testing and integration scenarios.

## Example: Using PseudoTransport

This example demonstrates setting up an in-process `McpServer`, registering a simple tool, and then using the `Client` with `PseudoTransport` to interact with it.

```
import { Client } from "@soulofmischief/mcp-client-sdk/client/index.js";
import { PseudoTransport } from "@soulofmischief/mcp-client-sdk/client/pseudo.js";
import { McpServer } from "@soulofmischief/mcp-client-sdk/server/mcp.js"; // McpServer is included for PseudoTransport use
import { CallToolResult, Implementation } from "@soulofmischief/mcp-client-sdk/types.js";
// Example UI component import (replace with your actual UI)
// import { Button } from "./ui/Button.tsx";
import { z } from "zod";

// Mock Button for demonstration if not in a React environment
const Button = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => {
    return {children};
};


export function Demo() {

    async function runDemo() {
        console.log("Setting up McpServer...");
        const serverInfo: Implementation = { name: "PseudoServer", version: "1.0.0" };
        // Note: McpServer is available in this fork primarily for PseudoTransport usage
        const mcpServer = new McpServer(serverInfo);

        // Register a simple echo tool on the server
        mcpServer.tool(
            "echo",
            "Replies with the input message",
            // Using 'any' for simplicity here, define specific Zod schema for production
            { message: z.string().describe("The message to echo back") } as any,
            async (args: { message: string }): Promise => {
                console.log("[Server Tool] Echoing:", args.message);
                return { content: [{ type: "text", text: `Server echoed: ${args.message}` }] };
            }
        );
        console.log("McpServer configured with 'echo' tool.");


        console.log("\nCreating PseudoTransport and Client...");
        const transport = new PseudoTransport(mcpServer);
        const client = new Client({ name: 'PseudoClient', version: '1.0.0' });

        try {
            console.log("\nConnecting Client to PseudoTransport (this also connects the server internally)...");
            // Client connect calls transport.start(), which connects the server
            console.log("\nClient initializing connection...");
            await client.connect(transport);
            console.log("Client connected.");

            console.log("\nClient listing tools...");
            const toolsResult = await client.listTools();
            console.log("[Client] Tools listed:", toolsResult.tools);

            console.log("\nClient calling 'echo' tool...");
            const echoResult = await client.callTool({ name: "echo", arguments: { message: "Hello Pseudo World!" } });
            console.log("[Client] Echo tool result:", echoResult);

        } catch (error) {
            console.error("\nError during pseudo communication:", error);
        } finally {
            console.log("\nClosing client connection (which closes transport)...");
            await client.close(); // This calls transport.close()
            // Server cleanup might be needed depending on its implementation,
            // but PseudoTransport handles the linked closing.
            console.log("\nExample finished.");
        }
    }

    return (

            Run Demo

    );
}
```

## Basic Client Usage

Here's how you typically use the `Client` class (assuming you have a transport implementation appropriate for your environment, like one based on WebSockets or Fetch for browser usage, or the included `PseudoTransport`):

```
import { Client } from "@soulofmischief/mcp-client-sdk/client/index.js";
// Import your chosen transport implementation
// e.g., import { WebSocketTransport } from './my-websocket-transport.js';
// e.g., import { PseudoTransport } from "@soulofmischief/mcp-client-sdk/client/pseudo.js";

// Assume 'transport' is an initialized instance of a transport class
// const transport = new WebSocketTransport({ url: 'ws://mcp-server.com' });
// Or using the PseudoTransport with an in-process server:
// const transport = new PseudoTransport(myMcpServerInstance);

const client = new Client({
    name: "my-mcp-client",
    version: "1.0.0"
});

async function main() {
    try {
        // Connect to the server via the transport
        await client.connect(transport);
        console.log("Connected to MCP server:", client.serverInfo?.name);

        // List available tools
        const toolsList = await client.listTools();
        console.log("Available tools:", toolsList.tools.map(t => t.name));

        // Call a tool (example)
        if (toolsList.tools.some(t => t.name === 'example-tool')) {
            const result = await client.callTool({
                name: "example-tool",
                arguments: { param1: "value1" }
            });
            console.log("Tool result:", result.content);
        }

        // Read a resource (example)
        const resource = await client.readResource({
            uri: "info://server/status"
        });
        console.log("Resource content:", resource.contents?.text);

    } catch (error) {
        console.error("MCP Client Error:", error);
    } finally {
        // Disconnect the client
        await client.close();
        console.log("Client disconnected.");
    }
}

main();
```

## Documentation

For more information on the Model Context Protocol itself:

*   [Model Context Protocol Documentation](https://modelcontextprotocol.io)
*   [MCP Specification](https://spec.modelcontextprotocol.io)

For the original SDK this fork is based on:

*   [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

This project retains the original MIT License. See the LICENSE file for details.

## Special Thanks

*   [@moinfra](https://github.com/moinfra) for the original web-compatible fork of the MCP TypeScript SDK
