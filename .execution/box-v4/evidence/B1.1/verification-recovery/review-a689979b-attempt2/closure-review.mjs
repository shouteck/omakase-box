import { readFile } from "node:fs/promises";
const dir = "/workspace/.d1-r4-reviewer-review-a689979b-attempt2";
const manifest = JSON.parse(await readFile(dir + "/scripts/box-verification/environment-manifest.json", "utf8"));
const { verifyDependencyClosure } = await import(dir + "/scripts/box-verification/environment-host.mjs");
const result = await verifyDependencyClosure(manifest.linuxDependencies, { root: "/workspace/node_modules" });
console.log(JSON.stringify(result));