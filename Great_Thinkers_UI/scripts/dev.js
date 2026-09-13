import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "server/index.js"], { stdio: "inherit" }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  ),
];
function stop() {
  children.forEach((child) => child.kill());
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) =>
  child.on("exit", () => {
    stop();
    process.exit();
  }),
);
