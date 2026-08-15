import { aggregateContextCost, componentContextCost } from "./catalog.mjs";

const sections = [
  {
    kind: "block",
    title: "Instruction blocks",
    description: "Always-on guidance inside owned AGENTS.md markers; existing text is preserved",
  },
  {
    kind: "skill",
    title: "Skills",
    description: "On-demand expertise with optional references and resources",
  },
  {
    kind: "command",
    title: "Commands",
    description: "Explicit skills invoked as $name in Codex or /name in Grok and Claude",
  },
  {
    kind: "plugin",
    title: "Agent integrations",
    description: "Vendor-native plugins, language servers, and marketplaces",
  },
];

const sectionAliases = new Map([
  ["block", "block"],
  ["blocks", "block"],
  ["instruction", "block"],
  ["instructions", "block"],
  ["skill", "skill"],
  ["skills", "skill"],
  ["command", "command"],
  ["commands", "command"],
  ["plugin", "plugin"],
  ["plugins", "plugin"],
  ["integration", "plugin"],
  ["integrations", "plugin"],
]);

export function sectionKind(value) {
  if (!value || value === "all") return null;
  const kind = sectionAliases.get(value.toLowerCase());
  if (!kind) {
    throw new Error(`Unknown section: ${value}. Use blocks, skills, commands, or integrations.`);
  }
  return kind;
}

export function orderedComponents(components) {
  const rank = new Map(sections.map((section, index) => [section.kind, index]));
  return components
    .map((component, index) => ({ component, index }))
    .sort((left, right) => (rank.get(left.component.kind) ?? sections.length)
      - (rank.get(right.component.kind) ?? sections.length)
      || left.index - right.index)
    .map(({ component }) => component);
}

export function formatBanner(subtitle = "Curate the agent layer for this repository.") {
  const title = `${paint("1;36", "HARNESS")} ${paint("2", "/")} ${paint("1;35", "WORKSHOP")}`;
  return [
    "",
    `${paint("36", "╭─")} ${title}`,
    `${paint("36", "│")}  ${paint("2", subtitle)}`,
    paint("36", "╰────────────────────────────────────────────────────────"),
  ].join("\n");
}

export function formatProjectScan({ cwd, stack, catalogSize, suggestedCount, installedCount = 0 }) {
  return formatStage("Project scan", [
    paint("2", cwd),
    `Stack      ${stack.length ? stack.join(paint("2", " · ")) : paint("2", "No specific stack detected")}`,
    `Workshop   ${catalogSize} curated components · ${suggestedCount} suggested${installedCount ? ` · ${installedCount} installed` : ""}`,
  ]);
}

export function formatCatalog(components, {
  detected = {},
  installedIds = new Set(),
  numbered = false,
  suggest = () => ({ pick: false }),
} = {}) {
  const ordered = orderedComponents(components);
  const indexes = new Map(ordered.map((component, index) => [component.id, index + 1]));
  const output = [];

  for (const section of sections) {
    const items = ordered.filter((component) => component.kind === section.kind);
    if (!items.length) continue;
    output.push(`${paint("1;36", "◆")} ${paint("1", section.title)} ${paint("2", `(${items.length})`)}`);
    output.push(`  ${paint("2", section.description)}`);
    output.push("");
    for (const component of items) {
      const recommendation = suggest(component, detected);
      const installed = installedIds.has(component.id);
      const marker = installed ? paint("32", "✓") : recommendation.pick ? paint("33", "★") : paint("2", "·");
      const number = numbered ? `${String(indexes.get(component.id)).padStart(2, "0")} ` : "";
      const state = installed ? paint("32", " installed") : "";
      output.push(`  ${number}${marker} ${paint("1", component.id)}  ${component.name}${state}`);
      output.push(`     ${component.description}`);
      output.push(`     ${paint("2", componentMetadata(component, recommendation))}`);
    }
    output.push("");
  }

  return output.join("\n").trimEnd();
}

export function formatSelection(components) {
  const lines = [];
  for (const section of sections) {
    const ids = components.filter((component) => component.kind === section.kind).map(({ id }) => id);
    if (ids.length) lines.push(`${section.title.padEnd(20)} ${ids.join(", ")}`);
  }
  const context = aggregateContextCost(components);
  if (context.words) {
    lines.push(`Always-loaded text   ${context.words} words · ~${context.estimatedTokens} tokens`);
  }
  return formatStage("Selected components", lines.length ? lines : [paint("2", "None")]);
}

export function formatBlockCost(components) {
  const context = aggregateContextCost(components);
  return `${components.length} block${components.length === 1 ? "" : "s"} · ${context.words} words · ~${context.estimatedTokens} tokens`;
}

export function formatProgress(message) {
  return `${paint("35", "◇")} ${paint("1", message)}`;
}

export function formatApplySummary(planner, { components = [], action = "Applied" } = {}) {
  const operations = planner.operations();
  if (!operations.length && !planner.notes.length) return "No file changes.";

  const creates = operations.filter(({ before, after }) => before.kind === "missing" && after.kind !== "missing");
  const removes = operations.filter(({ after }) => after.kind === "missing");
  const updates = operations.filter(({ before, after }) => before.kind !== "missing" && after.kind !== "missing");
  const output = [];

  if (components.length) output.push(formatSelection(components));
  if (operations.length) {
    output.push(formatStage("Change set", [
      `${paint("32", `+${creates.length}`)} create  ${paint("33", `~${updates.length}`)} update  ${paint("31", `-${removes.length}`)} remove`,
      ...operationPreview(operations),
    ]));
  }
  if (planner.notes.length) {
    output.push(formatStage("Manual steps (not executed)", planner.notes));
  }
  const footer = [
    `${paint("32", "╰─")} ${paint("1;32", action)} · ${operations.length} file change${operations.length === 1 ? "" : "s"}`,
    `   ${paint("2", "Next")}  harness-workshop doctor`,
  ];
  const commands = components.filter(({ kind }) => kind === "command");
  if (commands.length && !/removed/i.test(action)) {
    footer.push(`   ${paint("2", "Try")}   ${commands.map(({ id }) => {
      const name = id.slice("command/".length);
      return `$${name} · /${name}`;
    }).join("  ")}`);
  }
  output.push(footer.join("\n"));
  return output.join("\n\n");
}

export function formatHealthy(componentCount, hasManualSteps = false) {
  const detail = hasManualSteps ? " · manual tools are recorded but not asserted" : "";
  return `${paint("32", "◆")} ${paint("1;32", "Healthy")} · ${componentCount} component${componentCount === 1 ? "" : "s"} match the manifest and lockfile${detail}.`;
}

export function formatDryRunFooter() {
  return `${paint("33", "╰─")} ${paint("1", "Dry run complete")} · no files written and no external commands executed.`;
}

export function formatListHeader(componentCount, installedCount, filter = null) {
  const scope = filter ? `${sectionTitle(filter)} · ` : "";
  return `${paint("35", "◇")} ${scope}${componentCount} available${installedCount ? ` · ${installedCount} installed` : ""}`;
}

export function sectionTitle(kind) {
  return sections.find((section) => section.kind === kind)?.title ?? kind;
}

function formatStage(title, lines) {
  const output = [`${paint("35", "◇")} ${paint("1", title)}`];
  lines.forEach((line, index) => {
    output.push(`${paint("2", index === lines.length - 1 ? "╰" : "│")} ${line}`);
  });
  return output.join("\n");
}

function componentMetadata(component, recommendation) {
  const parts = [];
  parts.push(component.adapters?.length ? component.adapters.map(capitalize).join("/") : "portable");
  parts.push(component.scopes.join("/"));
  if (component.context) {
    const loading = {
      always: "always loaded",
      "on-demand": "on demand",
      explicit: "explicit",
      none: "no prompt context",
    }[component.context.loading] ?? component.context.loading;
    parts.push(loading);
    const cost = componentContextCost(component);
    if (component.kind === "block") parts.push(`${cost.words} words`);
    if (cost.estimatedTokens) parts.push(`~${cost.estimatedTokens} tokens`);
  }
  if (component.requires?.commands?.length) parts.push(`requires ${component.requires.commands.join(", ")}`);
  if (component.conflictsWith?.length) parts.push(`conflicts with ${component.conflictsWith.join(", ")}`);
  if (recommendation.pick && recommendation.reason) parts.push(`suggested: ${recommendation.reason}`);
  return parts.join(" · ");
}

function operationPreview(operations) {
  const limit = 10;
  const lines = operations.slice(0, limit).map(({ before, after, label }) => {
    if (after.kind === "missing") return `${paint("31", "−")} ${label}`;
    if (before.kind === "missing") return `${paint("32", "+")} ${label}`;
    return `${paint("33", "~")} ${label}`;
  });
  if (operations.length > limit) lines.push(paint("2", `… ${operations.length - limit} more files`));
  return lines;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function paint(code, value) {
  if (!useColor()) return value;
  return `\u001b[${code}m${value}\u001b[0m`;
}

function useColor() {
  if (Object.hasOwn(process.env, "NO_COLOR")) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return Boolean(process.stdout.isTTY);
}
