/** Pages Functions adapter: thin wrapper over the portable /s handler. */
import { handleShareRequest } from "./_shared/handle-share";

export const onRequest = async (context: any): Promise<Response> => {
  return handleShareRequest(context.request, () => context.next());
};
