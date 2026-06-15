/**
 * Protocol foundations and interaction patterns — public API.
 *
 * S01 (§1, §2.1–§2.2):
 *   roles, messages, implementation, conformance, capabilities
 * S05 (§4.1–§4.3):
 *   MetaObject, RequestMetaObject, LoggingLevel, validateRequestMeta,
 *   error codes INVALID_PARAMS_CODE / MISSING_CLIENT_CAPABILITY_CODE
 * S06 (§4.4–§4.7):
 *   ContinuationId, isValidContinuationId, isStringContinuationId, STATELESS_MODEL
 * S07 (§5.1–§5.2):
 *   PROTOCOL_REVISION_FORMAT_RE, isValidRevisionFormat, checkHttpRevisionHeader,
 *   HTTP_REVISION_MISMATCH_STATUS, MCP_PROTOCOL_VERSION_HEADER
 * S08 (§5.3):
 *   DiscoverRequest/DiscoverResult/DiscoverResultResponse schemas,
 *   validateDiscoverRequest, processDiscoverRequest, buildDiscoverResult,
 *   buildDiscoverRequest/Response, selectRevision, resolveInstructions,
 *   UNSUPPORTED_PROTOCOL_VERSION_CODE, buildUnsupportedProtocolVersionError
 * S17 (§11):
 *   InputRequiredResult, InputRequest, InputResponseRequestParams,
 *   discriminateResultType, isInputRequiredResult, isLoadSheddingResult,
 *   validateInputResponseKeys, MRTR_PARTICIPATING_METHODS
 * S18 (§12):
 *   PaginatedRequestParams, PaginatedResult, cursor helpers, paginationCacheKey
 * S19 (§13):
 *   CacheableResult, isCacheHintValid, isFresh, resolveCacheScope,
 *   hasConsistentCacheScope, CACHEABLE_METHODS
 * S22 (§15.1–§15.2):
 *   ProgressNotification, CancelledNotification, ProgressTracker,
 *   validateCancellationTarget, PROGRESS_NOTIFICATION_METHOD, CANCELLED_NOTIFICATION_METHOD
 * S23 (§15.3–§15.4):
 *   LoggingMessageNotification, validateLogLevelOptIn, resolvedMinLogLevelIndex,
 *   relayTraceContext, extractTraceContext, TRACE_CONTEXT_BARE_KEYS
 */

export * from './roles.js';
export * from './messages.js';
export * from './implementation.js';
export * from './conformance.js';
export * from './capabilities.js';
export * from './capability-negotiation.js';
export * from './extensions.js';
export * from './extension-mechanism.js';
export * from './meta.js';
export * from './stateless.js';
export * from './revision.js';
export * from './discovery.js';
export * from './negotiation.js';
export * from './errors.js';
export * from './streaming.js';
export * from './authorization.js';
export * from './authorization-flow.js';
export * from './authorization-registration.js';
export * from './multi-round-trip.js';
export * from './pagination.js';
export * from './caching.js';
export * from './progress.js';
export * from './logging.js';
export * from './tools.js';
export * from './tools-call.js';
export * from './resources.js';
export * from './resources-read.js';
export * from './prompts.js';
export * from './completion.js';
export * from './elicitation.js';
export * from './elicitation-form.js';
export * from './roots.js';
export * from './sampling.js';
export * from './tasks.js';
export * from './tasks-lifecycle.js';
export * from './ui.js';
export * from './ui-host.js';
export * from './conformance-requirements.js';
export * from './registries.js';
export * from './security.js';
