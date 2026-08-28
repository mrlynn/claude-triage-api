#!/usr/bin/env node
/**
 * Start the complete Northwind learning environment from the repo root.
 *
 * The two frontends default to port 3000 when run separately. Keeping their
 * ports here (rather than teaching shell one-liners) gives workshops and
 * first-time learners one reliable command and one stable set of URLs.
 */
import { spawn } from "node:child_process";
import net from "node:net";

const SERVICES = [
  { name: "api", color: "\x1b[36m", port: process.env.API_PORT ?? "8787", command: "npm", args: ["run", "dev"], env: { PORT: process.env.API_PORT ?? "8787" } },
  { name: "course", color: "\x1b[35m", port: process.env.COURSE_PORT ?? "3001", command: "npm", args: ["--prefix", "website", "run", "start", "--", "--port", process.env.COURSE_PORT ?? "3001"], env: {} },
  { name: "store", color: "\x1b[33m", port: process.env.STOREFRONT_PORT ?? "3002", command: "npm", args: ["--prefix", "storefront", "run", "dev", "--", "--port", process.env.STOREFRONT_PORT ?? "3002"], env: { ASSISTANT_ORIGIN: `http://localhost:${process.env.AGENT_PORT ?? "8790"}`, ASSISTANT_RUNTIME_TOKEN: process.env.ASSISTANT_RUNTIME_TOKEN ?? "northwind-local-agent" } },
  { name: "agent", color: "\x1b[32m", port: process.env.AGENT_PORT ?? "8790", command: "npm", args: ["--prefix", "agent-runtime", "run", "dev"], env: { PORT: process.env.AGENT_PORT ?? "8790", ASSISTANT_RUNTIME_TOKEN: process.env.ASSISTANT_RUNTIME_TOKEN ?? "northwind-local-agent" } },
];

const reset = "\x1b[0m";
const children = [];
let stopping = false;

function available(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      // Match Node's default listener behaviour. Probing only 127.0.0.1
      // misses a process bound to IPv6's :: on macOS and Linux.
      .listen(Number(port));
  });
}

function write(name, color, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line) process.stdout.write(`${color}[${name}]${reset} ${line}\n`);
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) if (!child.killed) child.kill("SIGKILL");
    process.exit(exitCode);
  }, 1_500).unref();
}

const unavailable = [];
for (const service of SERVICES) if (!(await available(service.port))) unavailable.push(service);
if (unavailable.length) {
  console.error("Cannot start the Northwind environment: these ports are already in use.");
  for (const service of unavailable) console.error(`  ${service.name}: ${service.port}`);
  console.error("Choose free ports, for example: API_PORT=8788 COURSE_PORT=3003 STOREFRONT_PORT=3004 npm run dev:all");
  process.exit(1);
}

console.log("\nNorthwind development environment");
console.log(`  API:        http://localhost:${SERVICES[0].port}`);
console.log(`  Course:     http://localhost:${SERVICES[1].port}`);
console.log(`  Storefront: http://localhost:${SERVICES[2].port}`);
console.log(`  Assistant: http://localhost:${SERVICES[3].port}`);
console.log("  Press Ctrl-C to stop all services.\n");

for (const service of SERVICES) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...service.env },
    stdio: ["inherit", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (chunk) => write(service.name, service.color, chunk));
  child.stderr.on("data", (chunk) => write(service.name, service.color, chunk));
  child.on("error", (error) => { write(service.name, service.color, error.message); stop(1); });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      write(service.name, service.color, `stopped unexpectedly (${signal ?? `exit ${code}`})`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
