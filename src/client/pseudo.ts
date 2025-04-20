import { JSONRPCMessage } from "../types.js";
import { Transport } from "../shared/transport.js";
import { McpServer } from "src/server/mcp.js";
/**
 * Pseudo-Transport for testing or embedding: connects an MCP client
 * directly to an McpServer instance within the same process, bypassing
 * actual network or stdio communication.
 *
 * Instantiate this with an McpServer, then pass this transport instance
 * to your MCP client's connect method.
 */
export class PseudoTransport implements Transport {
  private _started = false;
  private _mcpServer: McpServer;
  private _isServerConnected = false; // Track server's internal connection state via proxy

  // --- Client-facing handlers (set by the client SDK) ---
  private _clientMessageHandler?: (message: JSONRPCMessage) => void;
  private _clientErrorHandler?: (error: Error) => void;
  private _clientCloseHandler?: () => void;
  // --------------------------------------------------------

  // --- Server-facing handler (captured from McpServer via proxy) ---
  private _serverMessageHandler?: (message: JSONRPCMessage) => void;
  // --------------------------------------------------------

  /**
   * Creates a PseudoTransport instance linked to a specific McpServer.
   * @param mcpServer The McpServer instance to communicate with.
   */
  constructor(mcpServer: McpServer) {
    if (!mcpServer) {
      throw new Error("McpServer instance is required for PseudoTransport.");
    }
    this._mcpServer = mcpServer;
  }

  // --- Transport interface implementation for the CLIENT ---

  set onmessage(handler: ((message: JSONRPCMessage) => void) | undefined) {
    // console.log("[PseudoTransport] Client registered its message handler."); // Debug
    this._clientMessageHandler = handler;
  }
  get onmessage(): ((message: JSONRPCMessage) => void) | undefined {
    return this._clientMessageHandler;
  }

  set onerror(handler: ((error: Error) => void) | undefined) {
    // console.log("[PseudoTransport] Client registered its error handler."); // Debug
    this._clientErrorHandler = handler;
  }
  get onerror(): ((error: Error) => void) | undefined {
    return this._clientErrorHandler;
  }

  set onclose(handler: (() => void) | undefined) {
    // console.log("[PseudoTransport] Client registered its close handler."); // Debug
    this._clientCloseHandler = handler;
  }
  get onclose(): (() => void) | undefined {
    return this._clientCloseHandler;
  }

  /**
   * Starts the pseudo-connection. This internally connects the transport
   * to the provided McpServer instance and ensures handlers are set up
   * before resolving.
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error("PseudoTransport already started!");
    }
    // console.log("[PseudoTransport] Starting..."); // Debug

    // Create a proxy transport object specifically for the McpServer
    // Use 'self' to reliably refer to the PseudoTransport instance within the proxy methods
    const self = this;
    const serverFacingTransportProxy: Transport = {
      // --- Handler SET BY McpServer ---
      set onmessage(handler: ((message: JSONRPCMessage) => void) | undefined) {
        // console.log("[PseudoTransport Proxy] McpServer attempting to set message handler."); // Debug
        // Store the handler provided by McpServer
        self._serverMessageHandler = handler;
        // If the handler is set, mark the server side as ready
        if (handler) {
          self._isServerConnected = true;
          // console.log("[PseudoTransport Proxy] McpServer message handler captured."); // Debug
        } else {
          self._isServerConnected = false; // Handle server disconnecting/clearing handler
        }
      },
      get onmessage(): ((message: JSONRPCMessage) => void) | undefined {
        return self._serverMessageHandler;
      },

      // --- Method CALLED BY McpServer (to send TO client) ---
      send: async (message: JSONRPCMessage): Promise<void> => {
        // console.log("[PseudoTransport Proxy] McpServer sending message to Client:", message); // Debug
        // Route the message FROM server TO the CLIENT's registered handler
        if (self._clientMessageHandler) {
          // Simulate async delivery
          setTimeout(() => {
            try {
              self._clientMessageHandler!(message);
            } catch (error) {
              console.error("[PseudoTransport] Error in client onmessage handler:", error);
              // Report error back to the client's error handler
              self._clientErrorHandler?.(error instanceof Error ? error : new Error(String(error)));
            }
          }, 0);
        } else {
          console.warn("[PseudoTransport Proxy] Server tried to send message, but client has no handler set.");
        }
      },

      // --- Other methods for the server's perspective ---
      start: async (): Promise<void> => {
        // console.log("[PseudoTransport Proxy] Server called start() on proxy (No-op)."); // Debug
        // The real setup happens in PseudoTransport.start()
      },
      close: async (): Promise<void> => {
        // console.log("[PseudoTransport Proxy] Server called close() on proxy (No-op)."); // Debug
        self._isServerConnected = false;
        // This might indicate the server initiated a close. We could potentially notify the client here.
        // self.close(); // Careful with recursion if server close triggers client close triggers server close...
      },
      // Allow server to set these, but PseudoTransport might not act on them directly
      onerror: undefined,
      onclose: undefined,
    };

    try {
      // console.log("[PseudoTransport] Connecting internal McpServer..."); // Debug
      // IMPORTANT: Await the McpServer's connect method. This is where it should
      // set its message handler on the provided transport proxy.
      await this._mcpServer.connect(serverFacingTransportProxy);
      // console.log("[PseudoTransport] Internal McpServer.connect call finished."); // Debug

      // Double-check if the handler was actually set after connect returns.
      // It's possible the underlying Server sets it slightly later, although ideally connect awaits this.
      if (!this._serverMessageHandler) {
        // Introduce a small delay to allow for potential async handler setting within McpServer/Server connect
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!this._serverMessageHandler) {
          console.warn("[PseudoTransport] McpServer did NOT set a message handler after connect completed. Client requests might fail.");
          // Depending on requirements, you might throw an error here:
          // throw new Error("PseudoTransport setup failed: McpServer did not provide a message handler.");
        } else {
          // console.log("[PseudoTransport] Server handler confirmed after brief delay."); // Debug
        }
      } else {
        // console.log("[PseudoTransport] Server handler confirmed immediately after connect."); // Debug
      }

    } catch (error) {
      console.error("[PseudoTransport] Failed to connect internal McpServer:", error);
      // Notify the client SDK about the setup failure
      const err = error instanceof Error ? error : new Error("Failed to connect internal McpServer");
      this._clientErrorHandler?.(err);
      this._started = false; // Ensure we don't appear started
      throw err; // Re-throw to signal failure of start()
    }

    this._started = true;
    // console.log("[PseudoTransport] Started successfully."); // Debug
  }

  /**
   * Closes the pseudo-connection. Notifies the client.
   */
  async close(): Promise<void> {
    if (!this._started) {
      // console.log("[PseudoTransport] Close called but not started."); // Debug
      return Promise.resolve();
    }
    // console.log("[PseudoTransport] Closing..."); // Debug
    this._started = false;
    this._isServerConnected = false;

    // Notify the client SDK that the transport is closed
    const clientCloseHandler = this._clientCloseHandler;
    // Clear handlers *before* calling close handler to prevent potential loops
    this._serverMessageHandler = undefined;
    this._clientMessageHandler = undefined;
    this._clientErrorHandler = undefined;
    this._clientCloseHandler = undefined;

    // Use setTimeout to allow current execution stack to clear
    setTimeout(() => clientCloseHandler?.(), 0);

    // We generally DO NOT call _mcpServer.close() here,
    // as the server's lifecycle might be managed externally.
    // If PseudoTransport *owns* the server instance, you might add:
    // await this._mcpServer.close();

    // console.log("[PseudoTransport] Closed."); // Debug
    return Promise.resolve();
  }

  /**
   * Sends a message FROM the CLIENT TO the McpServer.
   * This will invoke the message handler the McpServer registered.
   * @param message The JSON-RPC message from the client.
   */
  send(message: JSONRPCMessage): Promise<void> {
    // console.log("[PseudoTransport] Client send requested:", message); // Debug
    if (!this._started) {
      console.error("[PseudoTransport] Send failed: Transport not started.");
      return Promise.reject(new Error("PseudoTransport is not started."));
    }
    // Check if the server handler is ready
    if (!this._serverMessageHandler || !this._isServerConnected) {
      console.error("[PseudoTransport] Send failed: McpServer handler not available or server not connected.");
      // Log the current state for debugging
      // console.log(`[PseudoTransport State] Started: ${this._started}, ServerConnected: ${this._isServerConnected}, ServerHandler: ${!!this._serverMessageHandler}`);
      return Promise.reject(new Error("PseudoTransport: McpServer handler not available or server not connected."));
    }

    // console.log("[PseudoTransport] Routing message from Client to Server handler."); // Debug

    // Capture the handler in case it gets cleared asynchronously
    const serverHandler = this._serverMessageHandler;

    // Simulate async delivery TO the server's handler
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          // console.log("[PseudoTransport] Invoking McpServer handler with:", message); // Debug
          serverHandler(message);
          // console.log("[PseudoTransport] McpServer handler invoked."); // Debug
          resolve(); // Resolve after handler is invoked
        } catch (error) {
          console.error("[PseudoTransport] Error invoking McpServer message handler:", error);
          // Report error back to the client's error handler
          const err = error instanceof Error ? error : new Error(String(error));
          this._clientErrorHandler?.(err);
          // Reject the send promise as the handling failed
          reject(err);
        }
      }, 0);
    });
  }
}
