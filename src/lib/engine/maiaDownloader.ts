import { promises as fs } from "fs";
import { createWriteStream, createReadStream } from "fs";
import { join } from "path";
import https from "https";
import http from "http";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";

export interface MaiaWeightInfo {
  rating: number;
  filename: string;
  url: string;
  size: number; // in bytes
}

/**
 * Maia weight files information
 * These are hosted on GitHub releases or can be downloaded from Maia project
 */
export const MAIA_WEIGHTS: MaiaWeightInfo[] = [
  {
    rating: 1100,
    filename: "maia-1100.pb",
    url: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz",
    size: 0, // Will be determined after download
  },
  {
    rating: 1500,
    filename: "maia-1500.pb",
    url: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1500.pb.gz",
    size: 0,
  },
  {
    rating: 1900,
    filename: "maia-1900.pb",
    url: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz",
    size: 0,
  },
  {
    rating: 2100,
    filename: "maia-2100.pb",
    url: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-2100.pb.gz",
    size: 0,
  },
];

/**
 * Download a file from URL
 */
async function downloadFile(
  url: string,
  destination: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = createWriteStream(destination);

    protocol
      .get(url, (response) => {
        // Handle redirects
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          if (response.headers.location) {
            return downloadFile(response.headers.location, destination).then(
              resolve,
              reject
            );
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination).catch(() => {});
          reject(
            new Error(
              `Failed to download: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(destination).catch(() => {});
        reject(err);
      });
  });
}

/**
 * Decompress gzip file
 */
async function decompressGzip(
  source: string,
  destination: string
): Promise<void> {
  const gunzip = createGunzip();
  const sourceStream = createReadStream(source);
  const destStream = createWriteStream(destination);

  await pipeline(sourceStream, gunzip, destStream);
  
  // Delete compressed file
  await fs.unlink(source).catch(() => {});
}

/**
 * Check if Maia weight file exists
 */
export async function checkMaiaWeightExists(
  weightsDir: string,
  filename: string
): Promise<boolean> {
  try {
    const filePath = join(weightsDir, filename);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and setup Maia weight file
 */
export async function downloadMaiaWeight(
  weightInfo: MaiaWeightInfo,
  weightsDir: string
): Promise<string> {
  const filename = weightInfo.filename;
  const filePath = join(weightsDir, filename);
  const compressedPath = filePath + ".gz";

  // Check if already downloaded
  if (await checkMaiaWeightExists(weightsDir, filename)) {
    console.log(`✅ Maia weight ${filename} already exists`);
    return filePath;
  }

  // Create weights directory if it doesn't exist
  try {
    await fs.mkdir(weightsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  console.log(`📥 Downloading Maia weight: ${filename}...`);
  console.log(`   URL: ${weightInfo.url}`);

  try {
    // Download compressed file
    await downloadFile(weightInfo.url, compressedPath);
    console.log(`✅ Downloaded ${filename}.gz`);

    // Decompress
    console.log(`📦 Decompressing ${filename}...`);
    await decompressGzip(compressedPath, filePath);
    console.log(`✅ Decompressed ${filename}`);

    return filePath;
  } catch (error) {
    console.error(`❌ Failed to download Maia weight ${filename}:`, error);
    throw error;
  }
}

/**
 * Download all Maia weights (or specific rating)
 */
export async function downloadMaiaWeights(
  weightsDir: string = "./maia-weights",
  rating?: number
): Promise<string[]> {
  const weightsToDownload = rating
    ? MAIA_WEIGHTS.filter((w) => w.rating === rating)
    : MAIA_WEIGHTS;

  const downloadedPaths: string[] = [];

  for (const weightInfo of weightsToDownload) {
    try {
      const path = await downloadMaiaWeight(weightInfo, weightsDir);
      downloadedPaths.push(path);
    } catch (error) {
      console.error(
        `Failed to download weight for rating ${weightInfo.rating}:`,
        error
      );
      // Continue with other weights
    }
  }

  return downloadedPaths;
}

/**
 * Get Maia weight file path for a given rating
 */
export async function getMaiaWeightPath(
  rating: number,
  weightsDir: string = "./maia-weights"
): Promise<string | null> {
  // Find appropriate weight file
  let weightInfo: MaiaWeightInfo | undefined;
  if (rating <= 1300) {
    weightInfo = MAIA_WEIGHTS.find((w) => w.rating === 1100);
  } else if (rating <= 1700) {
    weightInfo = MAIA_WEIGHTS.find((w) => w.rating === 1500);
  } else if (rating <= 2000) {
    weightInfo = MAIA_WEIGHTS.find((w) => w.rating === 1900);
  } else {
    weightInfo = MAIA_WEIGHTS.find((w) => w.rating === 2100);
  }

  if (!weightInfo) {
    return null;
  }

  const filePath = join(weightsDir, weightInfo.filename);

  // Check if exists, if not try to download
  if (!(await checkMaiaWeightExists(weightsDir, weightInfo.filename))) {
    try {
      await downloadMaiaWeight(weightInfo, weightsDir);
    } catch (error) {
      console.error(`Failed to download weight for rating ${rating}:`, error);
      return null;
    }
  }

  return filePath;
}

