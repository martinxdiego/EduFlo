import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

if (process.env.VERCEL) {
  const source = resolve(process.cwd(), ".next", "package.json");
  const destination = resolve(process.cwd(), "..", ".next", "package.json");

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);

  console.log("Prepared Next.js metadata for Vercel deployment.");
}
