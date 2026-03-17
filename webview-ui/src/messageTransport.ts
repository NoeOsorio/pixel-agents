type PostMessageFn = (msg: unknown) => void;

let _postMessage: PostMessageFn;

if (import.meta.hot) {
  // Standalone Vite mode — bridge HMR WebSocket to window message events
  import.meta.hot.on('pixel-agents:push', (data: unknown) => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  });
  _postMessage = (msg) => {
    import.meta.hot!.send('pixel-agents:msg', msg as Record<string, unknown>);
  };
} else {
  // VS Code extension webview — acquireVsCodeApi is injected by VS Code
  const api = (
    window as unknown as { acquireVsCodeApi: () => { postMessage: PostMessageFn } }
  ).acquireVsCodeApi();
  _postMessage = (msg) => api.postMessage(msg);
}

export const postMessage: PostMessageFn = _postMessage;
