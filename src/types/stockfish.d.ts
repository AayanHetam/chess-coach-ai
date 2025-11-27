declare module "stockfish.js/stockfish.js" {
  class Stockfish {
    constructor();
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: string): void;
    terminate(): void;
  }
  export default Stockfish;
}
