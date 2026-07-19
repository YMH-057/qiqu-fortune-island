/** Returns whether a rejected room join means the saved local identity is stale. */
export function shouldDiscardReconnectSession(error?: string): boolean {
  if (!error) {
    return false;
  }

  return ["\u91cd\u8fde\u51ed\u8bc1\u65e0\u6548", "\u91cd\u8fde\u8eab\u4efd\u65e0\u6548", "\u5df2\u88ab\u79fb\u51fa"].some((phrase) => error.includes(phrase));
}
