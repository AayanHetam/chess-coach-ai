import Stockfish from 'stockfish.js/stockfish.js';

const stockfish = new Stockfish();

self.onmessage = (event) => {
  const message = event.data;
  
  stockfish.postMessage(message);
};

stockfish.onmessage = (event) => {
  self.postMessage(event.data);
}; 