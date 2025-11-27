# Maia Chess Engine Integration

This application includes automatic Maia integration that downloads weights on-demand, making it accessible to all users without manual setup.

## How It Works

1. **Automatic Weight Download**: When Maia is first used, the system automatically downloads the appropriate weight file from GitHub releases
2. **Server-Side Execution**: Maia runs on the server (Next.js API routes) using Lc0 engine
3. **Rating-Based Selection**: Automatically selects the appropriate Maia model (1100, 1500, 1900, or 2100) based on user rating
4. **Graceful Fallback**: If Lc0 is not available, the system continues without Maia predictions

## Requirements

### For Full Maia Functionality

1. **Lc0 Engine**: Must be installed on the server
   - Download from: https://github.com/LeelaChessZero/lc0/releases
   - Or install via package manager:
     - macOS: `brew install lc0`
     - Linux: Available in most package managers
     - Windows: Download binary from releases

2. **Environment Variables** (Optional):
   ```bash
   LC0_PATH=/path/to/lc0          # Path to lc0 binary (if not in PATH)
   MAIA_WEIGHTS_PATH=./maia-weights  # Directory for Maia weights (default: ./maia-weights)
   ```

### Automatic Setup

The system will:
- ✅ Automatically download Maia weight files on first use
- ✅ Decompress gzipped weights automatically
- ✅ Cache weights for future use
- ✅ Select appropriate model based on user rating

## Weight Files

Maia weight files are automatically downloaded from:
- `maia-1100.pb` - For ratings ≤ 1300
- `maia-1500.pb` - For ratings 1301-1700 (default)
- `maia-1900.pb` - For ratings 1701-2000
- `maia-2100.pb` - For ratings > 2000

Files are stored in `./maia-weights/` directory (or path specified in `MAIA_WEIGHTS_PATH`).

## Usage

Maia is automatically used when:
1. User loads a game for analysis
2. User rating is available (from game headers or defaults to 1500)
3. Lc0 engine is available on the server

The system will:
- Download weights if missing
- Initialize Maia engine
- Get human-like move predictions
- Compare with Stockfish (optimal) moves
- Provide personalized coaching feedback

## Troubleshooting

### Maia Not Working

1. **Check Lc0 Installation**:
   ```bash
   which lc0
   # or
   lc0 --version
   ```

2. **Check Weight Files**:
   ```bash
   ls -lh maia-weights/
   ```

3. **Check Logs**: Look for Maia-related messages in server logs

### Manual Weight Download

If automatic download fails, you can manually download weights:

```bash
# Create weights directory
mkdir -p maia-weights

# Download and decompress (example for maia-1500)
wget https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1500.pb.gz
gunzip maia-1500.pb.gz
mv maia-1500.pb maia-weights/
```

## Performance Notes

- First use: May take time to download weights (~100-200MB per file)
- Subsequent uses: Fast (weights are cached)
- Predictions: Typically 1-3 seconds per position
- Limited to 20 positions per game to avoid timeouts

## Fallback Behavior

If Maia is not available:
- System continues with Stockfish-only analysis
- No errors shown to users
- All features work except Maia-specific personalized feedback

