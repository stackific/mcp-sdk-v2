import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { AppLayout } from '@/components/app-layout';
import { AppsPage } from '@/routes/apps';
import { AuthorizationPage } from '@/routes/authorization';
import { CachingPage } from '@/routes/caching';
import { CapabilitiesPage } from '@/routes/capabilities';
import { CompletionPage } from '@/routes/completion';
import { ConformancePage } from '@/routes/conformance';
import { ContentPage } from '@/routes/content';
import { ElicitConfirmPage } from '@/routes/elicit';
import { ElicitationPage } from '@/routes/elicitation';
import { ErrorsPage } from '@/routes/errors';
import { ExtensionsPage } from '@/routes/extensions';
import { FoundationsPage } from '@/routes/foundations';
import { JsonModelPage } from '@/routes/json-model';
import { JsonRpcPage } from '@/routes/jsonrpc';
import { LifecyclePage } from '@/routes/lifecycle';
import { LoggingPage } from '@/routes/logging';
import { MetaPage } from '@/routes/meta';
import { MrtrPage } from '@/routes/mrtr';
import { NotificationsPage } from '@/routes/notifications';
import { OverviewPage } from '@/routes/overview';
import { PaginationPage } from '@/routes/pagination';
import { ProgressPage } from '@/routes/progress';
import { PromptsPage } from '@/routes/prompts';
import { RegistriesPage } from '@/routes/registries';
import { ResourcesPage } from '@/routes/resources';
import { RootsPage } from '@/routes/roots';
import { SamplingPage } from '@/routes/sampling';
import { SecurityPage } from '@/routes/security';
import { StatelessPage } from '@/routes/stateless';
import { SubscriptionsPage } from '@/routes/subscriptions';
import { TasksPage } from '@/routes/tasks';
import { TemplatesPage } from '@/routes/templates';
import { ToolsPage } from '@/routes/tools';
import { TracingPage } from '@/routes/tracing';
import { TransportPage } from '@/routes/transport';

const rootRoute = createRootRoute();

// The main app (sidebar layout) and all capability pages under it.
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppLayout });

const page = (path: string, component: () => JSX.Element) =>
  createRoute({ getParentRoute: () => appRoute, path, component });

const appChildren = [
  createRoute({ getParentRoute: () => appRoute, path: '/', component: OverviewPage }),
  // I · Foundations
  page('/foundations', FoundationsPage),
  page('/json-model', JsonModelPage),
  page('/jsonrpc', JsonRpcPage),
  page('/meta', MetaPage),
  page('/stateless', StatelessPage),
  page('/capabilities', CapabilitiesPage),
  page('/extensions', ExtensionsPage),
  // II · Transports
  page('/transport', TransportPage),
  // III · Interaction & utilities
  page('/mrtr', MrtrPage),
  page('/pagination', PaginationPage),
  page('/caching', CachingPage),
  page('/content', ContentPage),
  page('/progress', ProgressPage),
  page('/logging', LoggingPage),
  page('/tracing', TracingPage),
  page('/notifications', NotificationsPage),
  page('/subscriptions', SubscriptionsPage),
  // IV · Server features
  page('/tools', ToolsPage),
  page('/resources', ResourcesPage),
  page('/templates', TemplatesPage),
  page('/prompts', PromptsPage),
  page('/completion', CompletionPage),
  // V · Client features
  page('/elicitation', ElicitationPage),
  page('/sampling', SamplingPage),
  page('/roots', RootsPage),
  // VI · Errors & authorization
  page('/errors', ErrorsPage),
  page('/authorization', AuthorizationPage),
  // VII · Extensions
  page('/tasks', TasksPage),
  page('/apps', AppsPage),
  // VIII · Governance
  page('/lifecycle', LifecyclePage),
  page('/security', SecurityPage),
  page('/conformance', ConformancePage),
  page('/registries', RegistriesPage),
];

// Standalone (no sidebar) — the URL-elicitation popup confirmation page.
const elicitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/elicit/$id',
  component: ElicitConfirmPage,
});

// TanStack's code-based addChildren types don't infer through the page() helper + heterogeneous
// arrays; the routes are correct at runtime, so we cast to sidestep the inference limitation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routeTree = (rootRoute as any).addChildren([
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (appRoute as any).addChildren(appChildren),
  elicitRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
