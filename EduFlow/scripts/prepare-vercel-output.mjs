import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

if (process.env.VERCEL) {
  const sourceDirectory = resolve(process.cwd(), ".next");
  const destinationDirectory = resolve(process.cwd(), "..", ".next");
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const metadataFiles = entries.filter((entry) => entry.isFile());

  await mkdir(destinationDirectory, { recursive: true });
  await Promise.all(
    metadataFiles.map((entry) =>
      copyFile(
        resolve(sourceDirectory, entry.name),
        resolve(destinationDirectory, entry.name),
      ),
    ),
  );
  await cp(
    resolve(sourceDirectory, "server"),
    resolve(destinationDirectory, "server"),
    { recursive: true },
  );

  console.log(
    `Prepared ${metadataFiles.length} Next.js metadata files and server manifests for Vercel deployment.`,
  );
}
