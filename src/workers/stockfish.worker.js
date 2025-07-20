// Load Stockfish from CDN
self.importScripts("https://cdn.jsdelivr.net/npm/stockfish.js/stockfish.js");

// Create a Stockfish instance
const stockfish = self.Stockfish();

// Forward messages from the main thread to Stockfish
self.onmessage = (event) => {
  stockfish.postMessage(event.data);
};

// Forward messages from Stockfish to the main thread
stockfish.onmessage = (event) => {
  self.postMessage(event.data);
}; 