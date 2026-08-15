import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function detectStack(cwd = process.cwd()) {
  const exists = (entry) => fs.existsSync(path.join(cwd, entry));
  const read = (entry) => exists(entry) ? fs.readFileSync(path.join(cwd, entry), "utf8") : "";
  const context = {
    cwd,
    isGitRepo: exists(".git"),
    hasDockerfile: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].some(exists),
    hasDocs: exists("docs") || exists("README.md") || exists("readme.md"),
    hasTsConfig: exists("tsconfig.json"),
    hasPackageJson: exists("package.json"),
    hasPyProject: exists("pyproject.toml"),
    hasRequirementsTxt: exists("requirements.txt"),
    hasGoMod: exists("go.mod"),
    hasCargoToml: exists("Cargo.toml"),
  };

  try {
    context.hasTerraform = fs.readdirSync(cwd).some((name) => name.endsWith(".tf"))
      || exists("terraform") || exists("infra");
  } catch {
    context.hasTerraform = false;
  }

  context.hasPython = context.hasPyProject || context.hasRequirementsTxt;
  context.hasReact = false;
  context.hasVue = false;
  context.hasNextJs = false;
  context.hasSvelte = false;
  context.hasTypeScript = context.hasTsConfig;

  if (context.hasPackageJson) {
    try {
      const packageJson = JSON.parse(read("package.json"));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      context.hasReact = "react" in dependencies;
      context.hasVue = "vue" in dependencies;
      context.hasNextJs = "next" in dependencies;
      context.hasSvelte = "svelte" in dependencies || "@sveltejs/kit" in dependencies;
      context.hasTypeScript ||= "typescript" in dependencies;
    } catch {
      // A malformed package.json should not stop detection of other stacks.
    }
  }

  const pythonDependencies = `${read("pyproject.toml")}\n${read("requirements.txt")}`;
  context.hasFastAPI = /\bfastapi\b/i.test(pythonDependencies);

  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    context.isGitHubRepo = /github\.com/i.test(remote);
  } catch {
    context.isGitHubRepo = false;
  }

  return context;
}

export function humanSummary(context) {
  const labels = [
    ["hasReact", "React"],
    ["hasNextJs", "Next.js"],
    ["hasVue", "Vue"],
    ["hasSvelte", "Svelte"],
    ["hasTypeScript", "TypeScript"],
    ["hasPython", "Python"],
    ["hasFastAPI", "FastAPI"],
    ["hasGoMod", "Go"],
    ["hasCargoToml", "Rust"],
    ["hasTerraform", "Terraform"],
    ["hasDockerfile", "Docker"],
    ["isGitHubRepo", "GitHub"],
  ];
  return labels.filter(([signal]) => context[signal]).map(([, label]) => label);
}
