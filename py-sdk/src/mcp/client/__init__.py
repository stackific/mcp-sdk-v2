"""MCP client host: the high-level :class:`Client`, its transports, and OAuth helpers.

Re-exports the public surface of :mod:`mcp.client.client`, :mod:`mcp.client.transport`,
:mod:`mcp.client.http`, and :mod:`mcp.client.oauth`.
"""

from mcp.client.client import Client, RequestError
from mcp.client.http import StreamableHttpClientTransport, SubscriptionStream
from mcp.client.oauth import (
  build_authorize_url,
  create_pkce_pair,
  discover_oauth_metadata,
  exchange_authorization_code,
  register_client,
  verify_authorization_redirect,
)
from mcp.client.transport import ClientTransport, ClientTransportError

__all__ = [
  "Client",
  "RequestError",
  "ClientTransport",
  "ClientTransportError",
  "StreamableHttpClientTransport",
  "SubscriptionStream",
  "create_pkce_pair",
  "discover_oauth_metadata",
  "register_client",
  "build_authorize_url",
  "exchange_authorization_code",
  "verify_authorization_redirect",
]
