import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { defineConfig, type Plugin } from "vite";

const execFileAsync = promisify(execFile);

const mp4ExportPlugin = (): Plugin => ({
  name: "mp4-export",
  configureServer(server) {
    server.middlewares.use("/api/export-mp4", async (request, response) => {
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.end("Method not allowed");
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const exportDirectory = resolve(process.cwd(), "exports");
        await mkdir(exportDirectory, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const webmPath = resolve(exportDirectory, `.capture-${stamp}.webm`);
        const mp4Path = resolve(exportDirectory, `暮关一刃-${stamp}.mp4`);
        await writeFile(webmPath, Buffer.concat(chunks));
        await execFileAsync("ffmpeg", [
          "-y",
          "-i", webmPath,
          "-c:v", "libx264",
          "-vf", "fps=30",
          "-preset", "medium",
          "-crf", "18",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          mp4Path
        ]);
        await unlink(webmPath);
        const mp4 = await readFile(mp4Path);
        response.statusCode = 200;
        response.setHeader("Content-Type", "video/mp4");
        response.setHeader("Content-Length", String(mp4.length));
        response.end(mp4);
      } catch (error) {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : String(error));
      }
    });
  }
});

export default defineConfig({
  plugins: [mp4ExportPlugin()],
  server: { port: 4173, strictPort: true }
});
