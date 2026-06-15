[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / APPENDIX\_B\_RESERVED\_CODE\_SET

# Variable: APPENDIX\_B\_RESERVED\_CODE\_SET

> `const` **APPENDIX\_B\_RESERVED\_CODE\_SET**: `ReadonlySet`\<`number`\>

Defined in: [protocol/registries.ts:847](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L847)

The set of reserved error codes the §22 / Appendix B registry pins (the eight
codes a custom code MUST NOT collide with). Surfaced as a convenience set so a
caller need not derive it from [RESERVED\_ERROR\_CODES](RESERVED_ERROR_CODES.md); the `-32001`
HeaderMismatch member is the one that lies inside the `-32000..-32099` range.
(R-AppB-a, R-AppB-b)
