import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { spawn } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Stockfish using the system-installed version
const stockfish = spawn('stockfish');

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: Message[];
  position: string;
  model: string;
}

async function getStockfishAnalysis(fen: string, depth: number = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    let analysis = '';
    
    stockfish.stdout.on('data', (data) => {
      const output = data.toString();
      analysis += output;
      
      if (output.includes('bestmove')) {
        resolve(analysis);
      }
    });

    stockfish.stderr.on('data', (data) => {
      console.error(`Stockfish error: ${data}`);
    });

    stockfish.on('error', (error) => {
      reject(error);
    });

    // Send commands to Stockfish
    stockfish.stdin.write('position fen ' + fen + '\n');
    stockfish.stdin.write('go depth ' + depth + '\n');
  });
}

async function streamAnthropicResponse(messages: Message[], position: string, apiKey: string, controller: AbortController) {
  const anthropic = new Anthropic({
    apiKey: apiKey,
  });
  
  // Add Stockfish analysis to the last user message
  const stockfishAnalysis = await getStockfishAnalysis(position);
  const lastUserMessage = messages.findLast(m => m.role === 'user');
  if (lastUserMessage) {
    lastUserMessage.content = `Chess position (FEN): ${position}\nStockfish analysis:\n${stockfishAnalysis}\n\nUser question: ${lastUserMessage.content}`;
  }

  // Convert messages to Anthropic format and filter out system messages
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user' as const,
      content: m.content
    }));

  try {
    console.log('Creating Anthropic stream...');
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: anthropicMessages,
      stream: true,
    });
    console.log('Stream created successfully');

    // Create a TransformStream to convert Anthropic's stream format to SSE format
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        console.log('Received chunk from Anthropic');
        const text = decoder.decode(chunk);
        console.log('Decoded text:', text);
        
        try {
          const data = JSON.parse(text);
          console.log('Parsed data:', data);
          
          if (data.type === 'content_block_delta' && data.delta?.text) {
            const sseData = {
              choices: [{
                delta: {
                  content: data.delta.text
                }
              }]
            };
            const sseMessage = `data: ${JSON.stringify(sseData)}\n\n`;
            console.log('Sending SSE message:', sseMessage);
            controller.enqueue(encoder.encode(sseMessage));
          } else if (data.type === 'error') {
            console.error('Stream error:', data);
            throw new Error(data.error?.message || 'Stream error');
          }
        } catch (e) {
          console.error('Error processing stream chunk:', e);
          controller.error(e);
        }
      },
      flush(controller) {
        console.log('Stream completed');
        // Send a [DONE] message to signal completion
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.terminate();
      }
    });

    console.log('Setting up response stream...');
    const response = new Response(stream.toReadableStream().pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    console.log('Response stream setup complete');
    return response;
  } catch (error: any) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API error: ${error.message || 'Unknown error'}`);
  }
}

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    const { messages, position, model } = body;

    // Validate the position
    const chess = new Chess();
    try {
      chess.load(position);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid chess position' },
        { status: 400 }
      );
    }

    // Get the API key based on the selected model
    let apiKey = '';
    console.log('Selected model:', model);
    if (model === 'claude-sonnet-4-20250514') {
      apiKey = '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';
      console.log('Using hardcoded API key for testing');
      console.log('API key length:', apiKey.length);
    } else if (model === 'gemini-2.5-pro') {
      apiKey = process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey) {
      console.error('API key not found. Details:', {
        model: model,
        apiKeyLength: apiKey.length,
        isModelMatch: model === 'claude-sonnet-4-20250514'
      });
      return NextResponse.json(
        { error: 'API key not found for selected model' },
        { status: 400 }
      );
    }

    // Create a new AbortController for this request
    const controller = new AbortController();

    // Get the streaming response
    const response = await streamAnthropicResponse(messages, position, apiKey, controller);

    // Forward the streaming response
    return response;
  } catch (error: any) {
    console.error('Error processing chat request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 