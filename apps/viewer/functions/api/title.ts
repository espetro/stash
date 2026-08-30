/** Pages Functions adapter: thin wrapper over the portable /api/title handler. */
import { handleTitleRequest } from "../_shared/handle-title";

export const onRequest = async (context: any): Promise<Response> => {
  return handleTitleRequest(context.request);
};
