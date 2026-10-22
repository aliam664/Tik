import { rpc } from "./client";

/** Optional overlay — the arena plays on a local salon until this RPC is deployed. */
export async function crashGetState(token: string | null) {
  return rpc<Record<string, unknown>>("crash_get_state", { p_token: token });
}
