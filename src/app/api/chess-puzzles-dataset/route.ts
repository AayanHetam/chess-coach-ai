import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { promisify } from "util";

/**
 * Execute Python script and return result
 */
async function executePythonScript(
  scriptPath: string,
  args: string[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", [scriptPath, ...args]);
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

export async function POST(req: Request) {
  try {
    const { fen, themes, limit = 5, command = "find_similar" } = await req.json();

    const scriptPath = join(process.cwd(), "scripts", "chess_puzzles_service.py");

    let args: string[] = [command];

    if (command === "find_similar") {
      if (!fen) {
        return NextResponse.json(
          { error: "FEN position is required for find_similar" },
          { status: 400 }
        );
      }
      args.push(fen);
      if (themes && themes.length > 0) {
        args.push(themes.join(","));
      }
      args.push(limit.toString());
    } else if (command === "by_theme") {
      if (!themes || themes.length === 0) {
        return NextResponse.json(
          { error: "Themes are required for by_theme command" },
          { status: 400 }
        );
      }
      args.push(themes.join(","));
      args.push(limit.toString());
    }

    const result = await executePythonScript(scriptPath, args);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const command = searchParams.get("command") || "stats";

    const scriptPath = join(process.cwd(), "scripts", "chess_puzzles_service.py");
    const args = [command];

    const result = await executePythonScript(scriptPath, args);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

