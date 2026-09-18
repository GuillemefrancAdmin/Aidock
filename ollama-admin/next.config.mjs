import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Guard against MSYS/Git-Bash on Windows mangling a leading-slash value into a
// Windows path (e.g. "/ollama-admin" -> "C:/Users/.../ollama-admin"). The colon
// then crashes path-to-regexp v8 inside Next.js with a cryptic
// "Missing parameter name" error. Fail fast with an actionable message instead.
if (rawBasePath && /^[A-Za-z]:[\\/]/.test(rawBasePath)) {
  throw new Error(
    `NEXT_PUBLIC_BASE_PATH looks mangled by your shell into a Windows path: "${rawBasePath}".\n` +
      `This typically happens with Git Bash / MSYS on Windows. Workarounds:\n` +
      `  - prefix the command with MSYS_NO_PATHCONV=1, or\n` +
      `  - pass the value with a double leading slash (e.g. //ollama-admin), or\n` +
      `  - set the variable in a .env file or via cmd.exe / PowerShell.`
  );
}

const basePath = rawBasePath && !rawBasePath.startsWith("/") ? `/${rawBasePath}` : rawBasePath;
const normalizedBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath: normalizedBasePath || undefined,
};

export default withNextIntl(nextConfig);
