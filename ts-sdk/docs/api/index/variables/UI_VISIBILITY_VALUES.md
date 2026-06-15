[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_VISIBILITY\_VALUES

# Variable: UI\_VISIBILITY\_VALUES

> `const` **UI\_VISIBILITY\_VALUES**: readonly \[`"model"`, `"app"`\]

Defined in: [protocol/ui.ts:425](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L425)

The exact visibility enum strings: which actor may invoke a tool. (§26.3,
R-26.3-d)

  - `"model"` — callable by the model/agent via ordinary tool-calling (§16);
  - `"app"`   — callable by the rendered UI over the channel (§26.5).
