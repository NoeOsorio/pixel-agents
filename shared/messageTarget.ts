export interface MessageTarget {
  postMessage(msg: unknown): void | Promise<boolean>;
}
