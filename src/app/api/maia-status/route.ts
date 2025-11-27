import { NextResponse } from "next/server";
import { join } from "path";
import { spawn } from "child_process";

/**
 * Check if Lc0 is available on the server
 */
async function checkLc0Available(): Promise<boolean> {
  // Check environment variable first
  if (process.env.LC0_PATH) {
    return true; // Assume available if path is set
  }

  // Check common locations
  const commonPaths = [
    "lc0",
    "/usr/local/bin/lc0",
    "/usr/bin/lc0",
    join(process.cwd(), "lc0"),
    join(process.cwd(), "bin", "lc0"),
  ];

  // Try to find lc0 in PATH
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  for (const path of commonPaths) {
    try {
      await execAsync(`which ${path}`);
      return true;
    } catch {
      // Try next path
    }
  }

  // Try to run lc0 directly
  try {
    const testProcess = spawn("lc0", ["--help"]);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        testProcess.kill();
        resolve(false);
      }, 2000);

      testProcess.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });

      testProcess.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code === 0 || code === null);
      });
    });
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const lc0Available = await checkLc0Available();

    return NextResponse.json({
      lc0Available,
      maiaOptimal: lc0Available,
      message: lc0Available
        ? "MAIA is running optimally with Lc0"
        : "Lc0 is not installed. Install Lc0 for the best MAIA experience.",
      downloadLinks: {
        windows: "https://github.com/LeelaChessZero/lc0/releases/latest",
        macos: "https://github.com/LeelaChessZero/lc0/releases/latest",
        linux: "https://github.com/LeelaChessZero/lc0/releases/latest",
        homebrew: "brew install lc0",
        documentation: "https://github.com/LeelaChessZero/lc0",
      },
    });
  } catch (error) {
    console.error("Error checking MAIA status:", error);
    return NextResponse.json(
      {
        lc0Available: false,
        maiaOptimal: false,
        message: "Unable to check MAIA status",
        downloadLinks: {
          windows: "https://github.com/LeelaChessZero/lc0/releases/latest",
          macos: "https://github.com/LeelaChessZero/lc0/releases/latest",
          linux: "https://github.com/LeelaChessZero/lc0/releases/latest",
          homebrew: "brew install lc0",
          documentation: "https://github.com/LeelaChessZero/lc0",
        },
      },
      { status: 500 }
    );
  }
}

