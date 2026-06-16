using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Pure §25 Tasks helpers that the runtime relies on: the protocol-error-vs-application-error outcome
/// classification (§25.11, R-25.11-f/h/i) and the forbidden-for-tasks notification predicate
/// (§25.9/§25.10, R-25.9-a, R-25.10-g).
/// </summary>
public sealed class TaskHelpersTests
{
  [Fact]
  public void A_protocol_error_outcome_makes_the_task_failed() =>
    Assert.Equal(McpTaskStatus.Failed, Tasks.ClassifyTaskExecutionOutcome(TaskExecutionOutcomeKind.ProtocolError));

  [Fact]
  public void A_protocol_level_result_makes_the_task_completed_even_when_it_carries_an_application_error() =>
    // R-25.11-h/i: an application error (isError:true) stays inside `result`; the request still
    // completed at the protocol level, so the task is `completed`, not `failed`.
    Assert.Equal(McpTaskStatus.Completed, Tasks.ClassifyTaskExecutionOutcome(TaskExecutionOutcomeKind.Result));

  [Theory]
  [InlineData("notifications/progress")]
  [InlineData("notifications/message")]
  [InlineData("notifications/cancelled")]
  public void Progress_message_and_cancelled_are_forbidden_for_tasks(string method) =>
    Assert.True(Tasks.IsForbiddenTaskNotification(method));

  [Theory]
  [InlineData("notifications/tasks")]
  [InlineData("notifications/resources/updated")]
  [InlineData("notifications/tools/list_changed")]
  [InlineData("tasks/get")]
  public void Other_notifications_are_not_forbidden_for_tasks(string method) =>
    Assert.False(Tasks.IsForbiddenTaskNotification(method));

  [Fact]
  public void The_forbidden_set_is_exactly_progress_message_and_cancelled() =>
    Assert.Equal(
      new HashSet<string> { McpMethods.NotificationsProgress, McpMethods.NotificationsMessage, McpMethods.NotificationsCancelled },
      Tasks.ForbiddenNotificationMethods.ToHashSet());
}
