# 매뉴얼 페이지 런타임 에러 보고서

생성일: 2026-05-11T06:47:25.117Z

## 카카오톡 자동 배차 /arologis/admin/auto-dispatch
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)

## 수동 배차 admin /arologis/admin/manual-dispatch
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)

## 기사 배정 /arologis/admin/driver-assignment
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async getAvailableDrivers (http://localhost:5174/api/arologisAdminDispatchApi.ts:42:15)
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async getAvailableDrivers (http://localhost:5174/api/arologisAdminDispatchApi.ts:42:15)
- [console.error] [apiClient] 토큰 조회 IPC 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at http://localhost:5174/api/client.ts:26:44
    at async Axios.request (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/axios.js?v=00af5820:2646:14)
    at async listDispatches (http://localhost:5174/api/arologisAdminDispatchApi.ts:9:15)

## 견적서 상세 /sales/estimates/est-001
- [console.error] [EstimateRealtimeClient] 토큰 조회 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at connect (http://localhost:5174/realtime/createRealtimeClient.ts:45:46)
    at Object.subscribe (http://localhost:5174/realtime/createRealtimeClient.ts:130:10)
    at http://localhost:5174/routes/EstimateDetailPage.tsx:60:41
    at commitHookEffectListMount (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:16915:34)
    at commitPassiveMountOnFiber (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18161:17)
    at commitPassiveMountEffects_complete (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18129:17)
    at commitPassiveMountEffects_begin (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18119:15)
    at commitPassiveMountEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18109:11)
    at flushPassiveEffectsImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19490:11)
    at flushPassiveEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19447:22)
- [console.error] [EstimateRealtimeClient] 토큰 조회 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at connect (http://localhost:5174/realtime/createRealtimeClient.ts:45:46)
    at Object.subscribe (http://localhost:5174/realtime/createRealtimeClient.ts:130:10)
    at http://localhost:5174/routes/EstimateDetailPage.tsx:60:41
    at commitHookEffectListMount (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:16915:34)
    at invokePassiveEffectMountInDEV (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18324:19)
    at invokeEffectsInDev (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19701:19)
    at commitDoubleInvokeEffectsInDEV (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19686:15)
    at flushPassiveEffectsImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19503:13)
    at flushPassiveEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19447:22)
    at commitRootImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19416:13)
- [pageerror] Cannot read properties of undefined (reading 'length')
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'length')
    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:345:61)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at mountIndeterminateComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14926:21)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15914:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18874:28)
    at flushSyncCallbacks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:9119:30)
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'length')
    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:345:61)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at mountIndeterminateComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14926:21)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15914:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18874:28)
    at flushSyncCallbacks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:9119:30)
- [pageerror] Cannot read properties of undefined (reading 'length')
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'length')
    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:345:61)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at mountIndeterminateComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14926:21)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15914:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28)
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'length')
    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:345:61)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at mountIndeterminateComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14926:21)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15914:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28)
- [console.error] The above error occurred in the <bo> component:

    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:336:12)
    at div
    at http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:281:12
    at EstimateDetailPage (http://localhost:5174/routes/EstimateDetailPage.tsx:44:20)
    at RenderedRoute (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4131:5)
    at Outlet (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4537:26)
    at main
    at div
    at AppLayout (http://localhost:5174/components/AppLayout.tsx:29:16)
    at AuthGuard (http://localhost:5174/components/AuthGuard.tsx:5:29)
    at RenderedRoute (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4131:5)
    at RenderErrorBoundary (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4091:5)
    at DataRoutes (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:5282:5)
    at Router (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4544:15)
    at RouterProvider (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:5096:5)
    at AppRouter
    at QueryClientProvider (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@tanstack_react-query.js?v=489f0d5a:3235:3)
    at App (http://localhost:5174/App.tsx:16:21)

React will try to recreate this component tree from scratch using the error boundary you provided, RenderErrorBoundary.
- [console.error] React Router caught the following error during render TypeError: Cannot read properties of undefined (reading 'length')
    at bo (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@samhan_design-system.js?v=2eb64862:345:61)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at mountIndeterminateComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14926:21)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15914:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28) {componentStack: 
    at bo (http://localhost:5174/@fs/C:/dev/Samha…
    at App (http://localhost:5174/App.tsx:16:21)}

## 견적서 인쇄 /sales/estimates/est-001/print
- [pageerror] Cannot read properties of undefined (reading 'reduce')
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'reduce')
    at QuoteView (http://localhost:5174/print/QuoteView.tsx:37:33)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at updateFunctionComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14582:28)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15924:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18874:28)
    at flushSyncCallbacks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:9119:30)
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'reduce')
    at QuoteView (http://localhost:5174/print/QuoteView.tsx:37:33)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at updateFunctionComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14582:28)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15924:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18874:28)
    at flushSyncCallbacks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:9119:30)
- [pageerror] Cannot read properties of undefined (reading 'reduce')
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'reduce')
    at QuoteView (http://localhost:5174/print/QuoteView.tsx:37:33)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at updateFunctionComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14582:28)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15924:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28)
- [console.error] Error handled by React Router default ErrorBoundary: TypeError: Cannot read properties of undefined (reading 'reduce')
    at QuoteView (http://localhost:5174/print/QuoteView.tsx:37:33)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at updateFunctionComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14582:28)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15924:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28)
- [console.error] The above error occurred in the <QuoteView> component:

    at QuoteView (http://localhost:5174/print/QuoteView.tsx:15:18)
    at RenderedRoute (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4131:5)
    at Outlet (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4537:26)
    at main
    at div
    at AppLayout (http://localhost:5174/components/AppLayout.tsx:29:16)
    at AuthGuard (http://localhost:5174/components/AuthGuard.tsx:5:29)
    at RenderedRoute (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4131:5)
    at RenderErrorBoundary (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4091:5)
    at DataRoutes (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:5282:5)
    at Router (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:4544:15)
    at RouterProvider (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/react-router-dom.js?v=9f4751b3:5096:5)
    at AppRouter
    at QueryClientProvider (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/@tanstack_react-query.js?v=489f0d5a:3235:3)
    at App (http://localhost:5174/App.tsx:16:21)

React will try to recreate this component tree from scratch using the error boundary you provided, RenderErrorBoundary.
- [console.error] React Router caught the following error during render TypeError: Cannot read properties of undefined (reading 'reduce')
    at QuoteView (http://localhost:5174/print/QuoteView.tsx:37:33)
    at renderWithHooks (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:11548:26)
    at updateFunctionComponent (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:14582:28)
    at beginWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:15924:22)
    at beginWork$1 (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19753:22)
    at performUnitOfWork (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19201:20)
    at workLoopSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19137:13)
    at renderRootSync (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19116:15)
    at recoverFromConcurrentError (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18736:28)
    at performSyncWorkOnRoot (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18879:28) {componentStack: 
    at QuoteView (http://localhost:5174/print/Quo…
    at App (http://localhost:5174/App.tsx:16:21)}

## 매출 마감 일별 /sales/closing/daily
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl

## 세금계산서 취소 modal /accounting/tax-invoices/ti-001
- [console.error] [TaxInvoiceRealtimeClient] 토큰 조회 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at connect (http://localhost:5174/realtime/createRealtimeClient.ts:45:46)
    at Object.subscribe (http://localhost:5174/realtime/createRealtimeClient.ts:130:10)
    at http://localhost:5174/routes/TaxInvoiceDetailPage.tsx:57:43
    at commitHookEffectListMount (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:16915:34)
    at commitPassiveMountOnFiber (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18161:17)
    at commitPassiveMountEffects_complete (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18129:17)
    at commitPassiveMountEffects_begin (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18119:15)
    at commitPassiveMountEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18109:11)
    at flushPassiveEffectsImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19490:11)
    at flushPassiveEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19447:22)
- [console.error] [TaxInvoiceRealtimeClient] 토큰 조회 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at connect (http://localhost:5174/realtime/createRealtimeClient.ts:45:46)
    at Object.subscribe (http://localhost:5174/realtime/createRealtimeClient.ts:130:10)
    at http://localhost:5174/routes/TaxInvoiceDetailPage.tsx:57:43
    at commitHookEffectListMount (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:16915:34)
    at invokePassiveEffectMountInDEV (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:18324:19)
    at invokeEffectsInDev (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19701:19)
    at commitDoubleInvokeEffectsInDEV (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19686:15)
    at flushPassiveEffectsImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19503:13)
    at flushPassiveEffects (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19447:22)
    at commitRootImpl (http://localhost:5174/@fs/C:/dev/SamhanLogis/clients/desktop/node_modules/.vite/deps/chunk-WLA63DB5.js?v=20740926:19416:13)
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED
- [console.error] [TaxInvoiceRealtimeClient] 토큰 조회 실패 TypeError: Cannot read properties of undefined (reading 'getToken')
    at connect (http://localhost:5174/realtime/createRealtimeClient.ts:45:46)
    at http://localhost:5174/realtime/createRealtimeClient.ts:122:16
- [console.error] Failed to load resource: net::ERR_CONNECTION_REFUSED

## 월말 마감 실행 폼 /accounting/period-close/new
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl

## 검수 사진 첨부 fallback /warehouse/inbound-inspections/insp-001
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl

## 배송 완료 사진 fallback /arologis/deliveries/del-001
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl

## 방문 사진 fallback /sales/visits/visit-001
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl

## Desktop 검수 사진 viewer /warehouse/inbound-inspections/insp-001/photos
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
- [console.error] Error handled by React Router default ErrorBoundary: ErrorResponseImpl
