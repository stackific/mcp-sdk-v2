using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Transport;

/// <summary>
/// Exercises S12 response↔request correlation, multiplexing, ordering, and fail-in-flight-on-disconnect
/// (spec §7.2/§7.5), plus the malformed-id error helpers (§7.2 R-7.2-h). Mirrors the correlation
/// scenarios in the TypeScript <c>transport.test.ts</c>.
/// </summary>
public sealed class RequestCorrelatorTests
{
  private static JsonRpcSuccessResponse Response(RequestId id, JsonObject? result = null) =>
    new(id, result ?? new JsonObject { ["resultType"] = "complete" });

  // ─── AC-12.4 — association by id, independent of order/connection (R-7.2-e/f/g/o) ─────────────────

  [Fact]
  public async Task Resolves_a_request_when_a_matching_id_is_delivered()
  {
    var correlator = new RequestCorrelator();
    var task = correlator.Issue(99);
    Assert.True(correlator.Deliver(Response(99, new JsonObject { ["resultType"] = "complete", ["ok"] = true })));

    var response = (JsonRpcSuccessResponse)await task;
    Assert.Equal(new RequestId(99), response.Id);
    Assert.True(response.Result["ok"]!.GetValue<bool>());
  }

  [Fact]
  public async Task Matches_by_id_ignoring_an_unmatched_delivery()
  {
    var correlator = new RequestCorrelator();
    var task = correlator.Issue("abc");

    // An unmatched id is ignored (returns false), not thrown.
    Assert.False(correlator.Deliver(Response("zzz")));
    Assert.True(correlator.Deliver(Response("abc")));

    var response = (JsonRpcSuccessResponse)await task;
    Assert.Equal(new RequestId("abc"), response.Id);
  }

  [Fact]
  public async Task Keeps_string_and_number_ids_distinct_with_no_coercion()
  {
    var correlator = new RequestCorrelator();
    var numberTask = correlator.Issue(1);
    var stringTask = correlator.Issue("1");

    correlator.Deliver(Response("1", new JsonObject { ["resultType"] = "complete", ["which"] = "string" }));
    correlator.Deliver(Response(1, new JsonObject { ["resultType"] = "complete", ["which"] = "number" }));

    var numberResponse = (JsonRpcSuccessResponse)await numberTask;
    var stringResponse = (JsonRpcSuccessResponse)await stringTask;
    Assert.Equal("number", numberResponse.Result["which"]!.GetValue<string>());
    Assert.Equal("string", stringResponse.Result["which"]!.GetValue<string>());
  }

  [Fact]
  public async Task A_delivered_error_response_resolves_the_task_rather_than_faulting_it()
  {
    var correlator = new RequestCorrelator();
    var task = correlator.Issue(5);

    // An error response is a normal, fully delivered message: it RESOLVES, never faults.
    var errorResponse = new JsonRpcErrorResponse(5, new JsonRpcError(-32602, "Invalid params"));
    Assert.True(correlator.Deliver(errorResponse));

    var settled = await task;
    var typed = Assert.IsType<JsonRpcErrorResponse>(settled);
    Assert.Equal(-32602, typed.Error.Code);
  }

  [Fact]
  public void An_error_response_with_no_id_is_not_correlatable()
  {
    var correlator = new RequestCorrelator();
    correlator.Issue(5);
    // A malformed-id error response (null id) cannot be matched to an outstanding request.
    Assert.False(correlator.Deliver(new JsonRpcErrorResponse(null, new JsonRpcError(-32700, "Parse error"))));
    Assert.True(correlator.Has(5));
  }

  // ─── AC-12.6 — multiplexing (R-7.2-i/j/k/l) ──────────────────────────────────────────────────────

  [Fact]
  public void Permits_multiple_outstanding_requests_without_awaiting_the_first()
  {
    var correlator = new RequestCorrelator();
    correlator.Issue(1);
    correlator.Issue(2);
    correlator.Issue(3);

    Assert.Equal(3, correlator.Size);
    Assert.Equal(new RequestId[] { 1, 2, 3 }, correlator.Outstanding.OrderBy(id => id.ToString()).ToArray());
  }

  [Fact]
  public void Forbids_reuse_of_the_id_of_an_unanswered_request()
  {
    var correlator = new RequestCorrelator();
    correlator.Issue(5);
    // The reuse guard throws synchronously (before the awaitable is returned), so assert on the
    // Action overload by discarding the would-be Task.
    Assert.Throws<InvalidOperationException>(() => { _ = correlator.Issue(5); });
  }

  [Fact]
  public void Allows_reusing_an_id_once_its_response_has_been_delivered()
  {
    var correlator = new RequestCorrelator();
    correlator.Issue(5);
    correlator.Deliver(Response(5));
    // No throw — the id is free again.
    var exception = Record.Exception(() => { _ = correlator.Issue(5); });
    Assert.Null(exception);
  }

  // ─── AC-12.7 — out-of-order delivery (R-7.2-m/n/p) ────────────────────────────────────────────────

  [Fact]
  public async Task Matches_each_response_to_its_request_when_responses_arrive_reversed()
  {
    var correlator = new RequestCorrelator();
    var task2 = correlator.Issue(2);
    var task3 = correlator.Issue(3);

    // Responses arrive 3-then-2 (reverse of request order).
    correlator.Deliver(Response(3, new JsonObject { ["resultType"] = "complete", ["resources"] = new JsonArray() }));
    correlator.Deliver(Response(2, new JsonObject { ["resultType"] = "complete", ["tools"] = new JsonArray() }));

    var response3 = (JsonRpcSuccessResponse)await task3;
    var response2 = (JsonRpcSuccessResponse)await task2;
    Assert.Equal(new RequestId(3), response3.Id);
    Assert.Equal(new RequestId(2), response2.Id);
  }

  // ─── AC-12.16 / AC-12.24 — fail in-flight on disconnect (R-7.5-c/d/e, R-7.7-a) ────────────────────

  [Fact]
  public async Task Fails_every_outstanding_request_on_disconnect_with_a_transport_error()
  {
    var correlator = new RequestCorrelator();
    var task2 = correlator.Issue(2);
    var task3 = correlator.Issue(3);
    Assert.Equal(2, correlator.Size);

    var failed = correlator.FailAll(new TransportError("connection lost"));

    await Assert.ThrowsAsync<TransportError>(() => task2);
    await Assert.ThrowsAsync<TransportError>(() => task3);
    Assert.Equal(0, correlator.Size);
    Assert.Equal(new RequestId[] { 2, 3 }, failed.OrderBy(id => id.ToString()).ToArray());
  }

  [Fact]
  public async Task Fail_rejects_a_single_outstanding_request()
  {
    var correlator = new RequestCorrelator();
    var task = correlator.Issue(7);

    Assert.True(correlator.Fail(7, new TransportError("lost")));
    await Assert.ThrowsAsync<TransportError>(() => task);
    Assert.False(correlator.Has(7));

    // Failing an unknown id is a no-op returning false.
    Assert.False(correlator.Fail(7, new TransportError("again")));
  }

  // ─── AC-12.17 — MAY retry on a fresh correlator after failure (R-7.5-f) ───────────────────────────

  [Fact]
  public async Task The_same_id_may_be_reissued_on_a_fresh_correlator_after_failure()
  {
    var first = new RequestCorrelator();
    var firstTask = first.Issue(2);
    first.FailAll(new TransportError("connection lost"));
    await Assert.ThrowsAsync<TransportError>(() => firstTask);

    // Fresh connection: reissue the same id, succeed — no state is bound to the old correlator.
    var second = new RequestCorrelator();
    var secondTask = second.Issue(2);
    second.Deliver(Response(2, new JsonObject { ["resultType"] = "complete", ["retried"] = true }));
    var response = (JsonRpcSuccessResponse)await secondTask;
    Assert.True(response.Result["retried"]!.GetValue<bool>());
  }

  [Fact]
  public void A_late_response_after_a_failure_is_ignored()
  {
    var correlator = new RequestCorrelator();
    var task = correlator.Issue(9);
    correlator.FailAll(new TransportError("lost"));
    // Observe the fault so it is not unobserved.
    _ = task.ContinueWith(_ => { }, TaskScheduler.Default);

    // A response that arrives after the request was already failed is simply unmatched.
    Assert.False(correlator.Deliver(Response(9)));
  }

  // ─── Concurrency — many concurrent issues/deliveries resolve correctly ────────────────────────────

  [Fact]
  public async Task Resolves_many_concurrent_requests_delivered_from_parallel_threads()
  {
    var correlator = new RequestCorrelator();
    const int count = 200;
    var tasks = new Task<JsonRpcMessage>[count];
    for (var i = 0; i < count; i++)
    {
      tasks[i] = correlator.Issue(i);
    }

    await Parallel.ForEachAsync(Enumerable.Range(0, count), (i, _) =>
    {
      correlator.Deliver(Response(i, new JsonObject { ["resultType"] = "complete", ["n"] = i }));
      return ValueTask.CompletedTask;
    });

    var results = await Task.WhenAll(tasks);
    for (var i = 0; i < count; i++)
    {
      var response = (JsonRpcSuccessResponse)results[i];
      Assert.Equal(i, response.Result["n"]!.GetValue<int>());
    }
    Assert.Equal(0, correlator.Size);
  }

  // ─── AC-12.5 — malformed-id error MAY carry null id or omit it (R-7.2-h) ──────────────────────────

  [Fact]
  public void Build_parse_error_response_carries_the_parse_error_code_and_no_id()
  {
    var response = MalformedIdError.BuildParseErrorResponse();
    Assert.Null(response.Id);
    Assert.Equal(MalformedIdError.ParseErrorCode, response.Error.Code);
    Assert.Equal(-32700, MalformedIdError.ParseErrorCode);
  }

  [Fact]
  public void Build_parse_error_response_node_emits_explicit_null_id_when_requested()
  {
    var withNull = MalformedIdError.BuildParseErrorResponseNode(nullId: true);
    Assert.True(withNull.ContainsKey("id"));
    Assert.Null(withNull["id"]);

    var omitted = MalformedIdError.BuildParseErrorResponseNode(nullId: false);
    Assert.False(omitted.ContainsKey("id"));
  }

  [Theory]
  [InlineData("{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32700,\"message\":\"Parse error\"}}")]
  [InlineData("{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32700,\"message\":\"Parse error\"}}")]
  [InlineData("{\"jsonrpc\":\"2.0\",\"id\":7,\"error\":{\"code\":-32600,\"message\":\"Invalid Request\"}}")]
  [InlineData("{\"jsonrpc\":\"2.0\",\"id\":\"abc\",\"error\":{\"code\":-32700,\"message\":\"Parse error\"}}")]
  public void Accepts_valid_malformed_id_error_responses(string json)
  {
    Assert.True(MalformedIdError.IsAcceptableMalformedIdErrorResponse(JsonNode.Parse(json)));
  }

  [Theory]
  [InlineData("{\"id\":null,\"error\":{\"code\":-32700,\"message\":\"x\"}}")] // missing jsonrpc
  [InlineData("{\"jsonrpc\":\"1.0\",\"error\":{\"code\":-32700,\"message\":\"x\"}}")] // wrong version
  [InlineData("{\"jsonrpc\":\"2.0\",\"error\":{\"message\":\"x\"}}")] // missing code
  [InlineData("{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32700}}")] // missing message
  [InlineData("{\"jsonrpc\":\"2.0\",\"id\":true,\"error\":{\"code\":-32700,\"message\":\"x\"}}")] // bad id type
  [InlineData("{\"jsonrpc\":\"2.0\",\"result\":{}}")] // not an error
  public void Rejects_unacceptable_malformed_id_responses(string json)
  {
    Assert.False(MalformedIdError.IsAcceptableMalformedIdErrorResponse(JsonNode.Parse(json)));
  }
}
