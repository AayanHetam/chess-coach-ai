import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { method } = await request.json();

    // Check if we're in a serverless environment (Vercel)
    const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME;

    if (isServerless) {
      return NextResponse.json({
        success: false,
        message: "Lc0 installation is not supported in serverless environments like Vercel",
        isServerless: true,
        output: "Serverless environments have ephemeral storage and cannot install system binaries.",
      });
    }

    // For local development or server-based deployments
    if (method === "homebrew") {
      try {
        const { spawn } = await import("child_process");
        
        return new Promise<NextResponse>((resolve) => {
          const process = spawn("brew", ["install", "lc0"], {
            stdio: ["pipe", "pipe", "pipe"],
          });

          let output = "";
          let errorOutput = "";

          process.stdout.on("data", (data) => {
            output += data.toString();
          });

          process.stderr.on("data", (data) => {
            errorOutput += data.toString();
          });

          process.on("close", (code) => {
            if (code === 0) {
              resolve(NextResponse.json({
                success: true,
                message: "Lc0 installed successfully via Homebrew",
                output: output,
              }));
            } else {
              resolve(NextResponse.json({
                success: false,
                message: "Failed to install Lc0 via Homebrew",
                output: errorOutput || `Process exited with code ${code}`,
              }));
            }
          });

          process.on("error", (error) => {
            resolve(NextResponse.json({
              success: false,
              message: "Failed to start Homebrew installation",
              output: error.message,
            }));
          });
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: "Homebrew not available or installation failed",
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    if (method === "download") {
      return NextResponse.json({
        success: false,
        message: "Direct download not implemented. Please download Lc0 manually from the official releases.",
        output: "Visit https://github.com/LeelaChessZero/lc0/releases/latest",
      });
    }

    return NextResponse.json({
      success: false,
      message: "Invalid installation method",
      output: "Supported methods: homebrew, download",
    });

  } catch (error) {
    console.error("Install Lc0 error:", error);
    return NextResponse.json({
      success: false,
      message: "Internal server error during Lc0 installation",
      output: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
