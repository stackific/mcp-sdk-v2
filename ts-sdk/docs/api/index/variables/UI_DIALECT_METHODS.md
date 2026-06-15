[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_DIALECT\_METHODS

# Variable: UI\_DIALECT\_METHODS

> `const` **UI\_DIALECT\_METHODS**: `object`

Defined in: [protocol/ui-host.ts:131](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L131)

The complete set of dialect method and notification names, reproduced
VERBATIM and case-sensitively. These are the only names a conforming dialect
message may carry; a name that is not byte-for-byte one of these is not part
of the dialect. (§26.6, R-26.5-a)

`notifications/message` is the core logging method name reused verbatim — it
is taken from S23's [LOGGING\_MESSAGE\_METHOD](LOGGING_MESSAGE_METHOD.md), never re-spelled.

## Type Declaration

### INITIALIZE

> `readonly` **INITIALIZE**: `"ui/initialize"` = `'ui/initialize'`

request, UI → Host. Opens the channel. (§26.5.1)

### INITIALIZED

> `readonly` **INITIALIZED**: `"ui/notifications/initialized"` = `'ui/notifications/initialized'`

notification, UI → Host. Handshake completion. (§26.5.1)

### TOOL\_INPUT

> `readonly` **TOOL\_INPUT**: `"ui/notifications/tool-input"` = `'ui/notifications/tool-input'`

notification, Host → UI. Complete tool arguments. (§26.5.2)

### TOOL\_INPUT\_PARTIAL

> `readonly` **TOOL\_INPUT\_PARTIAL**: `"ui/notifications/tool-input-partial"` = `'ui/notifications/tool-input-partial'`

notification, Host → UI. Streaming snapshot of tool arguments. (§26.5.2)

### TOOL\_RESULT

> `readonly` **TOOL\_RESULT**: `"ui/notifications/tool-result"` = `'ui/notifications/tool-result'`

notification, Host → UI. The tool result. (§26.5.2)

### TOOL\_CANCELLED

> `readonly` **TOOL\_CANCELLED**: `"ui/notifications/tool-cancelled"` = `'ui/notifications/tool-cancelled'`

notification, Host → UI. The tool call was cancelled. (§26.5.2)

### TOOLS\_CALL

> `readonly` **TOOLS\_CALL**: `"tools/call"` = `'tools/call'`

request, UI → Host. Invoke a server tool (mediated). (§26.5.3)

### RESOURCES\_READ

> `readonly` **RESOURCES\_READ**: `"resources/read"` = `'resources/read'`

request, UI → Host. Read a server resource (mediated). (§26.5.3)

### OPEN\_LINK

> `readonly` **OPEN\_LINK**: `"ui/open-link"` = `'ui/open-link'`

request, UI → Host. Open an external link. (§26.5.3)

### MESSAGE

> `readonly` **MESSAGE**: `"ui/message"` = `'ui/message'`

request, UI → Host. Insert a conversation message. (§26.5.3)

### REQUEST\_DISPLAY\_MODE

> `readonly` **REQUEST\_DISPLAY\_MODE**: `"ui/request-display-mode"` = `'ui/request-display-mode'`

request, UI → Host. Request a display-mode change. (§26.5.3)

### UPDATE\_MODEL\_CONTEXT

> `readonly` **UPDATE\_MODEL\_CONTEXT**: `"ui/update-model-context"` = `'ui/update-model-context'`

request, UI → Host. Supply content into the model context. (§26.5.3)

### LOG\_MESSAGE

> `readonly` **LOG\_MESSAGE**: `"notifications/message"` = `LOGGING_MESSAGE_METHOD`

notification, UI → Host. A logging message (core §15.3 shape reused). (§26.5.3)

### PING

> `readonly` **PING**: `"ping"` = `'ping'`

request, UI ↔ Host (either direction). Liveness probe. (§26.5.3)

### SIZE\_CHANGED

> `readonly` **SIZE\_CHANGED**: `"ui/notifications/size-changed"` = `'ui/notifications/size-changed'`

notification, Host → UI. Container size changed. (§26.5.4)

### HOST\_CONTEXT\_CHANGED

> `readonly` **HOST\_CONTEXT\_CHANGED**: `"ui/notifications/host-context-changed"` = `'ui/notifications/host-context-changed'`

notification, Host → UI. Host-context fields changed (partial). (§26.5.4)

### RESOURCE\_TEARDOWN

> `readonly` **RESOURCE\_TEARDOWN**: `"ui/resource-teardown"` = `'ui/resource-teardown'`

request, Host → UI. Tear down before removal. (§26.5.4)

### SANDBOX\_PROXY\_READY

> `readonly` **SANDBOX\_PROXY\_READY**: `"ui/notifications/sandbox-proxy-ready"` = `'ui/notifications/sandbox-proxy-ready'`

notification, Sandbox → Host. Sandbox proxy is ready (host-internal). (§26.5.5)

### SANDBOX\_RESOURCE\_READY

> `readonly` **SANDBOX\_RESOURCE\_READY**: `"ui/notifications/sandbox-resource-ready"` = `'ui/notifications/sandbox-resource-ready'`

notification, Host → Sandbox. Deliver resource HTML + policy (host-internal). (§26.5.5)
