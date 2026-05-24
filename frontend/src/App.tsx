import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { AuthContextProvider } from './context/AuthContext.js';
import { UserContextProvider } from './context/UserContext.js';
import { WorkspaceContextProvider } from './context/WorkspaceContext.js';
import { DrawerContextProvider } from './context/DrawerContext.js';

/**
 * App root — wraps the router with all global context providers.
 * Provider order (inner-most to outer-most wins):
 *   DrawerContextProvider → WorkspaceContextProvider → UserContextProvider → AuthContextProvider
 *
 * AuthContextProvider is the outermost provider so the JWT lifecycle is
 * available to all child contexts and components.
 */
export function App() {
  return (
    <AuthContextProvider>
      <UserContextProvider>
        <WorkspaceContextProvider>
          <DrawerContextProvider>
            <RouterProvider router={router} />
          </DrawerContextProvider>
        </WorkspaceContextProvider>
      </UserContextProvider>
    </AuthContextProvider>
  );
}
