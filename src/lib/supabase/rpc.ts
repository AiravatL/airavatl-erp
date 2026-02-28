interface RpcErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function isMissingRpcError(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  return typeof error.message === "string" && error.message.includes("Could not find the function");
}

