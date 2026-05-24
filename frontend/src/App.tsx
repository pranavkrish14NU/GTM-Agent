import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { UserContextProvider } from './context/UserContext.js';
import { WorkspaceContextProvider } from './context/WorkspaceContext.js';
import { DrawerContextProvider } from './context/DrawerContext.js';

/**
 * App root — wraps the router with all global context providers.
 * Provider order (inner-most to outer-most wins):
 *   DrawerContextProvider → WorkspaceContextProvider → UserContextProvider
 */
export function App() {
  return (
    <UserContextProvider>
      <WorkspaceContextProvider>
        <DrawerContextProvider>
          <RouterProvider router={router} />
        </DrawerContextProvider>
      </WorkspaceContextProvider>
    </UserContextProvider>
  );
}
