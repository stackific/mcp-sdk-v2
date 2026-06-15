[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / WELL\_KNOWN\_URI\_SCHEMES

# Variable: WELL\_KNOWN\_URI\_SCHEMES

> `const` **WELL\_KNOWN\_URI\_SCHEMES**: readonly \[`"https"`, `"file"`, `"git"`\]

Defined in: [protocol/resources-read.ts:551](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L551)

The standard (NON-exhaustive) URI schemes a resource `uri` commonly uses.
(§17.9, R-17.9-a, R-17.9-b, R-17.9-c)

  - `https` — use ONLY when the client can fetch and load the resource
    directly from the web on its own, without reading it via the MCP server.
  - `file`  — local-filesystem resources (including non-regular files such as
    directories, see [INODE\_DIRECTORY\_MIME\_TYPE](INODE_DIRECTORY_MIME_TYPE.md)).
  - `git`   — resources addressed in a Git repository.

The list is explicitly non-exhaustive: an implementation MAY use additional
custom schemes (which MUST conform to RFC3986). (R-17.9-a, R-17.9-e)
